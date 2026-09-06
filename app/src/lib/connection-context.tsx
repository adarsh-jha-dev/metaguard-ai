"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { Catalog, Connection } from "@/lib/db/types";
import type { GovernanceReport } from "@/lib/db/insights";

/**
 * Client-side home for a user's database credentials.
 *
 * They live in `sessionStorage` only: scoped to this tab, wiped when it closes,
 * never sent anywhere except this app's own API routes, and never persisted by
 * the server. Switching to `localStorage` would survive a browser restart and
 * is deliberately not done.
 */

const STORAGE_KEY = "metaguard.connection.v1";

export type StoredConnection = Connection & { label?: string };

export type LiveCatalog = Catalog & { governance: GovernanceReport };

type ConnectionContextValue = {
  connection: StoredConnection | null;
  /** True once the initial sessionStorage read has happened (avoids a flash of "not connected"). */
  ready: boolean;
  catalog: LiveCatalog | null;
  catalogLoading: boolean;
  catalogError: string | null;
  connect: (connection: StoredConnection) => void;
  disconnect: () => void;
  refreshCatalog: () => Promise<void>;
  /** POSTs to a /api/connect/* route with the current credentials attached. */
  call: <T>(path: string, body?: Record<string, unknown>) => Promise<T>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

function readStored(): StoredConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredConnection) : null;
  } catch {
    return null;
  }
}

/**
 * sessionStorage is an external store, so it is subscribed to rather than
 * copied into state by an effect. `snapshot` is cached so repeat reads return a
 * stable reference, which useSyncExternalStore requires.
 */
let snapshot: StoredConnection | null | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): StoredConnection | null {
  if (snapshot === undefined) snapshot = readStored();
  return snapshot;
}

/** The server has no sessionStorage, so it always renders the disconnected state. */
const getServerSnapshot = (): StoredConnection | null => null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: StoredConnection | null) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** True only after hydration, so the UI never flashes "not connected" first. */
const subscribeNever = () => () => {};

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const connection = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  const [catalog, setCatalog] = useState<LiveCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(path: string, body: Record<string, unknown> = {}): Promise<T> => {
      const active = connection ?? readStored();
      if (!active) throw new Error("No database connected.");

      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, connection: active }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        const err = new Error(data?.error ?? `Request failed (${res.status})`);
        (err as Error & { hint?: string }).hint = data?.hint;
        throw err;
      }
      return data as T;
    },
    [connection]
  );

  const refreshCatalog = useCallback(async () => {
    const active = connection ?? readStored();
    if (!active) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const data = await call<LiveCatalog>("/api/connect/catalog", { schema: active.schema });
      setCatalog(data);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Could not read the schema.");
      setCatalog(null);
    } finally {
      setCatalogLoading(false);
    }
  }, [call, connection]);

  const connect = useCallback((next: StoredConnection) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing with storage disabled — the connection still works for
      // this page's lifetime, it just won't survive a navigation.
    }
    publish(next);
    setCatalog(null);
    setCatalogError(null);
  }, []);

  const disconnect = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
    publish(null);
    setCatalog(null);
    setCatalogError(null);
  }, []);

  // Pull the schema as soon as a connection appears. Scheduled rather than run
  // inline so the first setState lands in its own task instead of cascading a
  // re-render out of this effect body.
  useEffect(() => {
    if (!connection || catalog || catalogLoading || catalogError) return;
    const id = setTimeout(() => void refreshCatalog(), 0);
    return () => clearTimeout(id);
  }, [connection, catalog, catalogLoading, catalogError, refreshCatalog]);

  const value = useMemo(
    () => ({
      connection,
      ready,
      catalog,
      catalogLoading,
      catalogError,
      connect,
      disconnect,
      refreshCatalog,
      call,
    }),
    [connection, ready, catalog, catalogLoading, catalogError, connect, disconnect, refreshCatalog, call]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used inside <ConnectionProvider>");
  return ctx;
}

/** Human-readable name for the active source, used in headers and banners. */
export function connectionLabel(connection: StoredConnection | null): string {
  if (!connection) return "Demo catalog";
  return connection.label || `${connection.database} @ ${connection.host}`;
}

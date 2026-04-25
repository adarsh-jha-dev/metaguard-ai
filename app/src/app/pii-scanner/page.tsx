"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Loader2, Check, ChevronRight } from "lucide-react";

type Table = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  columns: any[];
};

type Classification = {
  column: string;
  classification: string;
  confidence: number;
  reason: string;
  approved?: boolean;
};

type ScanResult = {
  table: Table;
  classifications: Classification[];
};

export default function PIIScanner() {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tables")
      .then((r) => r.json())
      .then((d) => {
        setTables(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function scanTable(fqn: string) {
    setSelectedTable(fqn);
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fqn }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScanResult(data);
    } catch (e: any) {
      alert("Scan failed: " + e.message);
    } finally {
      setScanning(false);
    }
  }

  async function approveTag(columnName: string, tagFQN: string) {
    if (!scanResult) return;
    setApproving(columnName);
    try {
      const res = await fetch("/api/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: scanResult.table.id,
          columnName,
          tagFQN,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setScanResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            classifications: prev.classifications.map((c) =>
              c.column === columnName ? { ...c, approved: true } : c
            ),
          };
        });
      }
    } catch (e: any) {
      alert("Failed to apply tag: " + e.message);
    } finally {
      setApproving(null);
    }
  }

  const getBadgeColor = (classification: string) => {
    if (classification === "PII.Sensitive") return "bg-red-500/15 text-red-400 border-red-500/30";
    if (classification === "PII.NonSensitive") return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    return "bg-green-500/15 text-green-400 border-green-500/30";
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold">PII Scanner</h1>
          </div>
          <p className="text-zinc-400">
            AI-powered column classification — scan your tables to detect personally identifiable information.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Table List */}
          <div className="lg:col-span-1">
            <h2 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">Tables</h2>
            {loading ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading tables...
              </div>
            ) : (
              <div className="space-y-2">
                {tables.map((table: any) => (
                  <Card
                    key={table.id}
                    className={`p-4 cursor-pointer transition-all border bg-zinc-900 hover:bg-zinc-800 ${
                      selectedTable === table.fullyQualifiedName
                        ? "border-red-500/50 bg-zinc-800"
                        : "border-zinc-800"
                    }`}
                    onClick={() => scanTable(table.fullyQualifiedName)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-zinc-100">{table.name}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {table.columns?.length || 0} columns
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Scan Results */}
          <div className="lg:col-span-2">
            {scanning && (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-red-400" />
                <p className="font-medium">Scanning columns with AI...</p>
                <p className="text-sm text-zinc-500 mt-1">This takes a few seconds</p>
              </div>
            )}

            {!scanning && !scanResult && (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <Shield className="w-12 h-12 mb-4 opacity-20" />
                <p>Select a table to scan for PII</p>
              </div>
            )}

            {scanResult && !scanning && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                    Scan Results — {scanResult.table.name}
                  </h2>
                  <div className="flex gap-2 text-xs text-zinc-500">
                    <span className="text-red-400">
                      {scanResult.classifications.filter((c) => c.classification === "PII.Sensitive").length} sensitive
                    </span>
                    <span>·</span>
                    <span className="text-yellow-400">
                      {scanResult.classifications.filter((c) => c.classification === "PII.NonSensitive").length} non-sensitive
                    </span>
                    <span>·</span>
                    <span className="text-green-400">
                      {scanResult.classifications.filter((c) => c.classification === "NotPII").length} clean
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {scanResult.classifications.map((cls) => (
                    <Card
                      key={cls.column}
                      className="p-4 border border-zinc-800 bg-zinc-900"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-mono text-sm font-medium text-zinc-100">
                              {cls.column}
                            </p>
                            <Badge
                              variant="outline"
                              className={getBadgeColor(cls.classification)}
                            >
                              {cls.classification}
                            </Badge>
                            <span className="text-xs text-zinc-600">
                              {Math.round(cls.confidence * 100)}%
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500">{cls.reason}</p>
                        </div>

                        {cls.classification !== "NotPII" && (
                          <div className="ml-4">
                            {cls.approved ? (
                              <div className="flex items-center gap-1 text-green-400 text-xs">
                                <Check className="w-4 h-4" />
                                Tagged
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-zinc-700 hover:border-red-500/50 hover:bg-red-300 text-xs cursor-pointer"
                                disabled={approving === cls.column}
                                onClick={() => approveTag(cls.column, cls.classification)}
                              >
                                {approving === cls.column ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  "Approve Tag"
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
import { getTestSuites, getTestCases } from "@/lib/openmetadata";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [suitesData, casesData] = await Promise.all([
      getTestSuites(50).catch(() => ({ data: [] })),
      getTestCases(100).catch(() => ({ data: [] })),
    ]);

    const suites: Record<string, unknown>[] = suitesData.data || [];
    const cases: Record<string, unknown>[] = casesData.data || [];

    // Summarise each suite
    const suiteSummaries = suites.map((suite) => {
      const suiteId = suite.id as string;
      const suiteFqn = suite.fullyQualifiedName as string;
      const suiteCases = cases.filter((c) => {
        const ts = c.testSuite as Record<string, unknown> | undefined;
        return ts?.id === suiteId || ts?.fullyQualifiedName === suiteFqn;
      });

      let passed = 0;
      let failed = 0;
      let aborted = 0;

      suiteCases.forEach((tc) => {
        const result = tc.testCaseResult as Record<string, unknown> | undefined;
        const status = (result?.testCaseStatus as string)?.toLowerCase();
        if (status === "success") passed++;
        else if (status === "failed") failed++;
        else aborted++;
      });

      return {
        id: suiteId,
        name: suite.name,
        fqn: suiteFqn,
        description: suite.description,
        passed,
        failed,
        aborted,
        total: suiteCases.length,
      };
    });

    // Global stats
    const totalPassed = suiteSummaries.reduce((s, x) => s + x.passed, 0);
    const totalFailed = suiteSummaries.reduce((s, x) => s + x.failed, 0);
    const totalCases = cases.length;

    // Top failing tests (for quick AI analysis)
    const failingCases = cases
      .filter((c) => {
        const result = c.testCaseResult as Record<string, unknown> | undefined;
        return (result?.testCaseStatus as string)?.toLowerCase() === "failed";
      })
      .slice(0, 20)
      .map((c) => ({
        name: c.name as string,
        fqn: c.fullyQualifiedName as string,
        entityLink: c.entityLink as string,
        testType: (c.testDefinition as Record<string, unknown> | undefined)?.name as string,
        lastResult: (c.testCaseResult as Record<string, unknown> | undefined)?.result as string,
        description: c.description as string,
      }));

    return NextResponse.json({
      suites: suiteSummaries,
      failingCases,
      stats: {
        totalSuites: suites.length,
        totalCases,
        totalPassed,
        totalFailed,
        passRate: totalCases > 0 ? Math.round((totalPassed / totalCases) * 100) : 0,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

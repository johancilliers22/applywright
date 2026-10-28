#!/usr/bin/env node
/**
 * Seed a demo account through the public HTTP API (not the database), so it also
 * exercises the real endpoints. Safe to run against a local server only.
 *
 *   node scripts/seed.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.BASE_URL || "http://127.0.0.1:3160";
const EMAIL = process.env.SEED_EMAIL || "demo@applywright.example";
const PASSWORD = process.env.SEED_PASSWORD || "demo-password-123";

let cookie = "";

async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 200) };
  }
  if (!response.ok) {
    const error = new Error(`${method} ${path} → ${response.status} ${payload?.error?.code ?? ""} ${payload?.error?.message ?? ""}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

const CV = `ALEX MORGAN
Senior Product Engineer
alex.morgan@example.com · 07700 900123 · London, UK · alexmorgan.dev

SUMMARY
Product engineer with 8 years building customer-facing web platforms in UK fintech and health tech.
Shipped and operated systems serving 2.4 million monthly users, led a four-person platform team,
and cut p95 API latency from 840ms to 220ms.

EXPERIENCE

Platform Lead — Northgate Digital, London (2022 to present)
- Led a team of four engineers rebuilding the account-opening platform used by 2.4 million customers.
- Reduced p95 API latency from 840ms to 220ms by introducing a request-scoped cache and removing three N+1 query paths.
- Cut cloud spend by £186,000 a year by right-sizing 60 services and moving batch work to scheduled jobs.
- Introduced contract tests across 14 services, dropping production incidents from 9 a quarter to 2.
- Owned regulatory delivery for FCA reporting changes, shipped 11 days ahead of the deadline.

Senior Engineer — Kestrel Health, Remote (2019 to 2022)
- Designed the appointment scheduling API handling 380,000 bookings a month at 99.98% availability.
- Rebuilt the clinical notes editor in React and TypeScript, reducing time-on-task by 41% in usability testing.
- Introduced trunk-based delivery and feature flags, taking releases from fortnightly to daily.
- Mentored five engineers; two were promoted within 18 months.

Engineer — Bright Harbour, Manchester (2017 to 2019)
- Built the first version of a customer data platform ingesting 40 million events a day.
- Migrated 23 services from a single VM to containers with zero customer downtime.

SKILLS
TypeScript, JavaScript, Node.js, React, PostgreSQL, Redis, Kafka, AWS (ECS, Lambda, RDS, S3),
Terraform, Docker, GitHub Actions, OpenTelemetry, incident command, technical mentoring.

EDUCATION
BSc Computer Science, University of Manchester (2013 to 2016), First class.
AWS Certified Solutions Architect Associate (2021).

NOTES
Full right to work in the UK. Available on 8 weeks' notice.`;

const JOB = `Senior Backend Engineer — Payments
We are a London fintech building payment infrastructure for 40,000 small businesses.
You will own services in Node.js and TypeScript, design PostgreSQL schemas, and work with
Kafka event streams. The team operates a 99.99% availability target and runs incident reviews.

What you will do
- Design and operate payment APIs that process 12 million transactions per month.
- Improve latency and reliability of core ledger services.
- Work with Terraform and AWS, and help migrate remaining workloads to containers.
- Mentor engineers and contribute to architectural decisions.
- Partner with compliance on FCA requirements.

What we are looking for
- 6+ years of backend experience, with deep Node.js and TypeScript.
- Strong PostgreSQL and event-driven design experience, ideally Kafka.
- Experience owning production systems and running incident response.
- Familiarity with AWS, Terraform, Docker and CI/CD.
- Excellent written communication.

Nice to have
- Payments, ledger or FCA-regulated experience.
- Experience reducing cloud cost.
- Experience mentoring.

Salary: £95,000 to £120,000 depending on experience, plus equity. Hybrid, London, 2 days a week.`;

const APPLICATIONS = [
  {
    title: "Senior Backend Engineer — Payments",
    company: "Ledgerline",
    text: JOB,
    status: "pack_ready",
  },
  {
    title: "Staff Platform Engineer",
    company: "Harbour Systems",
    text: `Staff Platform Engineer
We need a platform engineer to own our internal developer platform for 120 engineers.
You will work with Kubernetes, Terraform, AWS and Go or TypeScript, run reliability reviews,
and reduce lead time for change. Experience with incident response and observability required.
Salary £110,000 to £135,000, remote-first with quarterly onsite in Bristol.`,
    status: "submitted",
  },
  {
    title: "Engineering Manager, Payments",
    company: "Northbank",
    text: `Engineering Manager, Payments
Lead a team of eight engineers building payment services. You will own delivery, hiring and
technical direction. Strong background in backend systems, PostgreSQL, AWS and regulated
environments. Previous people management essential. Salary £105,000 to £125,000, London hybrid.`,
    status: "interview",
  },
];

const run = async () => {
  console.log(`seeding ${BASE}`);

  try {
    await call("/api/auth/register", { method: "POST", body: { email: EMAIL, password: PASSWORD, name: "Alex Morgan" } });
    console.log("  account created");
  } catch (error) {
    if (error.status === 409) {
      await call("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
      console.log("  signed in to existing account");
    } else {
      throw error;
    }
  }

  const existing = await call("/api/cvs");
  let cvId = existing.cvs[0]?.id;
  if (!cvId) {
    const created = await call("/api/cvs", { method: "POST", body: { name: "Alex Morgan — product engineer", text: CV, primary: true } });
    cvId = created.cv.id;
    console.log(`  cv created (${created.cv.format}, ${CV.length} chars)`);
  } else {
    console.log("  cv already present");
  }

  const analysis = await call("/api/analyse", { method: "POST", body: { cvId, jobText: JOB, title: "Senior Backend Engineer — Payments", company: "Ledgerline" } });
  console.log(`  analysis: ${analysis.report.score}/100, ${analysis.report.findings?.length ?? 0} findings`);

  for (const application of APPLICATIONS) {
    const result = await call("/api/tailor", {
      method: "POST",
      body: { cvId, jobText: application.text, title: application.title, company: application.company },
    });
    const id = result.application.id;
    if (application.status !== "pack_ready") {
      await call(`/api/applications/${id}`, { method: "PATCH", body: { status: application.status } });
    }
    console.log(`  pack: ${application.title} @ ${application.company} — ${result.score.score}/100, ${result.pack.mode}`);
  }

  const alerts = await call("/api/alerts");
  if (!alerts.alerts.length) {
    await call("/api/alerts", {
      method: "POST",
      body: {
        name: "Senior backend, London or remote",
        keywords: "backend engineer, node, typescript",
        locations: "London, Remote",
        remoteOnly: false,
        minSalary: 90000,
        cadence: "daily",
      },
    });
    console.log("  alert created");
  }

  const me = await call("/api/auth/me");
  console.log(`  plan ${me.plan}, packs used ${me.usage.packsThisMonth}`);
  console.log("\nready — sign in with", EMAIL, "/", PASSWORD);
};

run().catch((error) => {
  console.error("seed failed:", error.message);
  process.exit(1);
});

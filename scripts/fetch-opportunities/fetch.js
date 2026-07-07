// scripts/fetch-opportunities/fetch.js
//
// Pulls a configurable list of public RSS feeds (jobs, exams, scholarships),
// dedupes against what's already in Firestore, and writes only the new
// entries. Runs on a schedule via GitHub Actions — see the workflow file.
//
// Add or remove feeds in FEEDS below. Before adding a new source, check
// that it's actually meant to be consumed by feed readers/bots (most blog
// -style "RSS Feed" links are) — some sites disallow automated access in
// their robots.txt even for feed URLs, so it's worth a quick check per
// source rather than assuming.

const Parser = require("rss-parser");
const admin = require("firebase-admin");
const crypto = require("crypto");

const FEEDS = [
  { url: "https://news.google.com/rss/search?q=government+job+recruitment+India&hl=en-IN&gl=IN&ceid=IN:en", category: "Job" },
  { url: "https://news.google.com/rss/search?q=exam+notification+admit+card+India&hl=en-IN&gl=IN&ceid=IN:en", category: "Exam" },
  { url: "https://news.google.com/rss/search?q=scholarship+India+students&hl=en-IN&gl=IN&ceid=IN:en", category: "Scholarship" },
];

const KEYWORDS = {
  Exam: ["exam", "admit card", "result", "syllabus", "answer key", "hall ticket"],
  Scholarship: ["scholarship", "fellowship", "stipend"],
  Job: ["recruitment", "vacancy", "notification", "hiring", "job"],
};

function classify(title) {
  const t = title.toLowerCase();
  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return category;
  }
  return "Job";
}

function idFor(link) {
  return crypto.createHash("sha1").update(link).digest("hex").slice(0, 24);
}

async function main() {
  if (FEEDS.length === 0) {
    console.log("No feeds configured in FEEDS — add at least one in fetch.js. Exiting.");
    return;
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const parser = new Parser({ timeout: 15000 });
  let totalNew = 0;

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching: ${feed.url}`);
      const parsed = await parser.parseURL(feed.url);

      for (const item of parsed.items) {
        if (!item.link || !item.title) continue;
        const docId = idFor(item.link);
        const ref = db.collection("opportunities").doc(docId);
        const existing = await ref.get();
        if (existing.exists) continue; // already have it

        const category = feed.category || classify(item.title);
        await ref.set({
          title: item.title.trim(),
          link: item.link,
          source: parsed.title || feed.url,
          category,
          summary: (item.contentSnippet || "").slice(0, 300),
          publishedAt: item.isoDate
            ? admin.firestore.Timestamp.fromDate(new Date(item.isoDate))
            : admin.firestore.FieldValue.serverTimestamp(),
          fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        totalNew += 1;
        console.log(`  + new (${category}): ${item.title.trim()}`);
      }
    } catch (err) {
      console.error(`  ! failed to fetch ${feed.url}:`, err.message);
      // one bad feed shouldn't stop the others
    }
  }

  console.log(`Done. ${totalNew} new opportunity/opportunities added.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

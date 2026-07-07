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
//
// NOTE on Google News RSS queries: the `q=` param is an AND-match across
// every "+"-joined word. Keep each query to 2-3 words — real headlines
// rarely contain 5-6 specific terms together, so long queries silently
// return zero items (no error is thrown, the feed is just empty).

const Parser = require("rss-parser");
const admin = require("firebase-admin");
const crypto = require("crypto");

const FEEDS = [
  // Jobs (govt)
  { url: "https://news.google.com/rss/search?q=government+job+recruitment+India&hl=en-IN&gl=IN&ceid=IN:en", category: "Job" },
  { url: "https://news.google.com/rss/search?q=SSC+recruitment+notification&hl=en-IN&gl=IN&ceid=IN:en", category: "Job" },
  { url: "https://news.google.com/rss/search?q=UPSC+recruitment+vacancy&hl=en-IN&gl=IN&ceid=IN:en", category: "Job" },
  { url: "https://news.google.com/rss/search?q=bank+jobs+IBPS+SBI+recruitment&hl=en-IN&gl=IN&ceid=IN:en", category: "Job" },
  { url: "https://news.google.com/rss/search?q=railway+RRB+recruitment+2026&hl=en-IN&gl=IN&ceid=IN:en", category: "Job" },
  { url: "https://news.google.com/rss/search?q=result+declared+recruitment+India&hl=en-IN&gl=IN&ceid=IN:en", category: "Job" },

  // IT / tech jobs — kept to 2-3 words each so Google News AND-match actually returns hits
  { url: "https://news.google.com/rss/search?q=IT+hiring+India&hl=en-IN&gl=IN&ceid=IN:en", category: "IT" },
  { url: "https://news.google.com/rss/search?q=software+jobs+India&hl=en-IN&gl=IN&ceid=IN:en", category: "IT" },
  { url: "https://news.google.com/rss/search?q=TCS+Infosys+hiring&hl=en-IN&gl=IN&ceid=IN:en", category: "IT" },
  { url: "https://news.google.com/rss/search?q=tech+layoffs+hiring+India&hl=en-IN&gl=IN&ceid=IN:en", category: "IT" },
  { url: "https://news.google.com/rss/search?q=IT+recruitment+drive&hl=en-IN&gl=IN&ceid=IN:en", category: "IT" },
  { url: "https://news.google.com/rss/search?q=fresher+hiring+IT&hl=en-IN&gl=IN&ceid=IN:en", category: "IT" },
  { url: "https://news.google.com/rss/search?q=data+science+jobs+India&hl=en-IN&gl=IN&ceid=IN:en", category: "IT" },

  // Real live job-listing feeds (not news search) — good filler when Google News is thin
  { url: "https://weworkremotely.com/categories/remote-programming-jobs.rss", category: "IT" },
  { url: "https://remoteok.com/remote-dev-jobs.rss", category: "IT" },

  // Exams
  { url: "https://news.google.com/rss/search?q=exam+notification+admit+card+India&hl=en-IN&gl=IN&ceid=IN:en", category: "Exam" },
  { url: "https://news.google.com/rss/search?q=NEET+JEE+notification&hl=en-IN&gl=IN&ceid=IN:en", category: "Exam" },
  { url: "https://news.google.com/rss/search?q=CUET+UGC+NET+notification&hl=en-IN&gl=IN&ceid=IN:en", category: "Exam" },
  { url: "https://news.google.com/rss/search?q=admit+card+released+2026&hl=en-IN&gl=IN&ceid=IN:en", category: "Exam" },

  // Scholarships
  { url: "https://news.google.com/rss/search?q=scholarship+India+students&hl=en-IN&gl=IN&ceid=IN:en", category: "Scholarship" },
  { url: "https://news.google.com/rss/search?q=NSP+scholarship+portal&hl=en-IN&gl=IN&ceid=IN:en", category: "Scholarship" },

  // Official government press releases — high-signal secondary source
  { url: "https://www.pib.gov.in/ViewRss.aspx?reg=1&lang=1", category: "Government" },
];

const KEYWORDS = {
  Exam: ["exam", "admit card", "result", "syllabus", "answer key", "hall ticket"],
  Scholarship: ["scholarship", "fellowship", "stipend"],
  IT: ["developer", "software", "engineer", "IT ", "tech ", "data science", "machine learning"],
  Job: ["recruitment", "vacancy", "notification", "hiring", "job"],
};

function classify(title) {
  const t = title.toLowerCase();
  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => t.includes(w.toLowerCase()))) return category;
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
  let totalMerged = 0;
  const emptyFeeds = [];

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching (${feed.category}): ${feed.url}`);
      const parsed = await parser.parseURL(feed.url);

      console.log(`  → ${parsed.items.length} item(s) returned`);
      if (parsed.items.length === 0) {
        emptyFeeds.push(feed.url);
        console.warn(`  ⚠ zero results — query may be too narrow, or the feed source has no fresh items right now`);
      }

      for (const item of parsed.items) {
        if (!item.link || !item.title) continue;

        const docId = idFor(item.link);
        const ref = db.collection("opportunities").doc(docId);
        const existing = await ref.get();
        const category = feed.category || classify(item.title);

        if (existing.exists) {
          // Same article can legitimately match more than one feed/category
          // (e.g. an "IT recruitment" story hitting both a Job and an IT
          // query). Merge into a categories[] array instead of skipping,
          // so it still shows up under every relevant filter.
          const data = existing.data();
          const categories = new Set(data.categories || [data.category].filter(Boolean));
          if (!categories.has(category)) {
            categories.add(category);
            await ref.update({ categories: Array.from(categories) });
            totalMerged += 1;
            console.log(`  ~ merged category (${category}) into existing: ${item.title.trim()}`);
          }
          continue;
        }

        await ref.set({
          title: item.title.trim(),
          link: item.link,
          source: parsed.title || feed.url,
          category,                // primary category, kept for backward compatibility
          categories: [category],  // full set — filter your UI on this with array-contains
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

  console.log(`\nDone. ${totalNew} new item(s), ${totalMerged} category merge(s) on existing items.`);
  if (emptyFeeds.length) {
    console.log(`\nFeeds that returned zero items this run (worth reviewing if this persists):`);
    emptyFeeds.forEach((u) => console.log(`  - ${u}`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
# Farewell chat

A little goodbye website. A video of you loops quietly on the page. A coworker
types something, and you "reply" — the site works out what they meant and plays
the right pre-recorded clip, fading smoothly from the idle loop to the reaction
and back again.

Written to be run by someone who does not write code. You will never need to
edit anything except one file (`data/responses.json`) and a few settings pages
in a web browser.

---

## Table of contents

1. [How it works, in plain English](#1-how-it-works-in-plain-english)
2. [What's in this folder](#2-whats-in-this-folder)
3. [The manual steps — everything you must do by hand](#3-the-manual-steps)
   - [Step 1: Record your videos](#step-1-record-your-videos)
   - [Step 2: Create a GitHub account and upload this folder](#step-2-create-a-github-account-and-upload-this-folder)
   - [Step 3: Connect GitHub to Vercel and deploy](#step-3-connect-github-to-vercel-and-deploy)
   - [Step 4: Create the two API accounts](#step-4-create-the-two-api-accounts)
   - [Step 5: Paste your API keys into Vercel](#step-5-paste-your-api-keys-into-vercel)
   - [Step 6: Upload your videos and get their URLs](#step-6-upload-your-videos-and-get-their-urls)
   - [Step 7: Paste the URLs into the config file](#step-7-paste-the-urls-into-the-config-file)
4. [Testing the live site](#4-testing-the-live-site)
5. [Editing and redeploying later](#5-editing-and-redeploying-later)
6. [What this costs to run](#6-what-this-costs-to-run)
7. [If something goes wrong](#7-if-something-goes-wrong)

---

## 1. How it works, in plain English

When someone types a message, the site tries three things **in order**, and
stops as soon as one of them works. This is deliberate: each step costs more
than the last, so most messages never get past the free one.

| Step | What it does | What it costs |
|---|---|---|
| **Tier 0** | Looks for keywords and near-matches in your own list of phrases. Handles typos. | **Nothing.** No internet call at all. |
| **Tier 1** | If Tier 0 wasn't sure: one call to Voyage AI, which turns the message into numbers and finds the closest category by meaning rather than by spelling. | Effectively nothing — Voyage gives every account 200 million free tokens, and a chat message is about 10 of them. |
| **Tier 2** | If Tier 1 was still unsure: one very small call to Claude Haiku, which is shown only the list of category names and told to answer with one word. | About **£0.0004 (roughly 1/20th of a penny)** per message that gets this far. |

Once a category is decided, the site picks one of your clips for that category
at random — but a *weighted* random, so a clip with `"weight": 3` comes up three
times as often as one with `"weight": 1`. That stops the same reply appearing
every time.

If the two API keys are missing, nothing breaks. Tiers 1 and 2 are simply
skipped and anything unrecognised gets your "fallback" reply. So you can put
the site live first and add the keys later.

---

## 2. What's in this folder

```
farewell-chat/
├── data/
│   └── responses.json      <-- THE ONLY FILE YOU NEED TO EDIT
├── public/                 <-- the web page itself
│   ├── index.html
│   ├── style.css
│   └── app.js
├── api/
│   └── chat.js             <-- the bit that runs on Vercel's servers
├── lib/
│   └── classifier.js       <-- the 3-tier matching logic
├── scripts/
│   ├── test-matching.mjs           (optional self-check)
│   └── precompute-embeddings.mjs   (optional speed-up)
├── .env.example            <-- names of the two API keys (no real keys)
├── .gitignore
├── package.json
├── vercel.json
└── README.md               <-- you are here
```

`data/responses.json` is the source of truth. It holds every category, the
example phrases used to recognise it, the reply text, the weight, and the video
URL. Change it, push it, done.

---

## 3. The manual steps

> **Important:** every step below is something **you** must do yourself, in a
> browser, while logged in as you. Creating accounts and handling API keys is
> your job alone — nobody else should be doing it on your behalf, and your keys
> should never be pasted into a chat window, an email, or a file you upload to
> GitHub.

### Step 1: Record your videos

You need **one idle clip** and **one clip per reaction**. There are 20
categories in the config with 45 reply variants in total, but you absolutely do
not need 45 videos. Start with 6–10, delete the categories you don't want, and
add more later.

Tips that actually matter:

- **The idle clip** should be 5–15 seconds of you standing or sitting still,
  breathing, blinking, maybe a small shift. Start and end in a similar pose so
  the loop doesn't jump. No talking.
- **Reaction clips** should start and end in roughly that same pose too — that's
  what makes the crossfade look intentional rather than glitchy.
- Shoot them all in one sitting, same spot, same lighting, same shirt.
- Keep each reaction 2–6 seconds.
- Export as **MP4 (H.264)**. Aim for under 5 MB each — anything phone-recorded
  and trimmed will be fine. Free tools: CapCut, iMovie, Clipchamp (built into
  Windows), or the Photos app on a Mac.

**Do not put the video files in this folder.** They go to a video host in
Step 6. The `.gitignore` file deliberately blocks `.mp4`, `.mov` and `.webm`
from being uploaded to GitHub.

### Step 2: Create a GitHub account and upload this folder

**You do this by hand.**

1. Go to <https://github.com> and sign up (free). Verify your email.
2. Click the **+** in the top-right → **New repository**.
3. Name it something like `farewell-chat`. Choose **Private** if you'd rather
   coworkers not read all the punchlines in advance. Do **not** tick "Add a
   README file". Click **Create repository**.
4. On the next screen, click the link **uploading an existing file**.
5. Open this `farewell-chat` folder on your computer, select everything inside
   it, and drag it onto the browser window.
   - If your file manager hides files starting with a dot, make sure
     `.gitignore` and `.env.example` come along too. On Windows: View →
     Show → Hidden items. On Mac: press `Cmd + Shift + .` in Finder.
6. Scroll down, click **Commit changes**.

### Step 3: Connect GitHub to Vercel and deploy

**You do this by hand.**

1. Go to <https://vercel.com> and click **Sign Up**.
2. Choose **Continue with GitHub** — this is the connection between the two
   services. Approve the permissions GitHub asks for.
3. Pick the **Hobby** plan. It is free and it is the right one for this. (Note:
   Vercel's terms say Hobby is for non-commercial personal projects — a leaving
   present qualifies.)
4. On your Vercel dashboard, click **Add New… → Project**.
5. Find `farewell-chat` in the list and click **Import**.
6. Leave every build setting exactly as it is — the `vercel.json` file in this
   folder already tells Vercel what to do. Click **Deploy**.
7. Wait about a minute. You'll get a live URL like
   `https://farewell-chat-abc123.vercel.app`.

Open it. You should see the page with a grey box where the video will go and a
message telling you to add your idle video URL. That's correct at this stage —
typing a message will already give you text replies.

### Step 4: Create the two API accounts

**You do this by hand.** Both keys are optional — the site runs without them,
just with dumber matching. Add them when you're ready.

**Voyage AI** (Tier 1 — the cheap semantic matching):

1. Go to <https://www.voyageai.com> and create an account.
2. Find the **API Keys** section of the dashboard and create a new key.
3. Copy it somewhere safe for a moment. You'll paste it into Vercel in Step 5.
4. You get 200 million free tokens. You will not get near that.

**Anthropic** (Tier 2 — the Claude fallback):

1. Go to <https://platform.claude.com> and create an account.
2. Go to **Billing** and add a small amount of credit. The minimum is usually
   $5, and for this project that $5 will very likely outlive the website.
3. Go to **API keys** → **Create key**. Copy it.
4. While you're there, set a **spend limit** (Billing → Limits) of $5. This is
   the single best thing you can do to guarantee no surprise bill.

> A key looks like a long string of random characters. Treat it like a password:
> don't email it, don't paste it into a document, don't commit it to GitHub.
> The only place it goes is the Vercel settings page in the next step.

### Step 5: Paste your API keys into Vercel

**You do this by hand.**

1. In Vercel, open your project → **Settings** → **Environment Variables**.
2. Add the first one:
   - Key: `VOYAGE_API_KEY`
   - Value: paste your Voyage key
   - Environments: tick **Production**, **Preview** and **Development**
   - Click **Save**
3. Add the second one the same way:
   - Key: `ANTHROPIC_API_KEY`
   - Value: paste your Anthropic key
4. Go to the **Deployments** tab, click the **…** menu on the most recent
   deployment, and choose **Redeploy**. Environment variables only take effect
   on a fresh deployment.

The file `.env.example` in this folder lists these two names for reference. It
contains no real keys and it's safe to have on GitHub.

### Step 6: Upload your videos and get their URLs

**You do this by hand.** Pick **one** of these two. Cloudflare R2 is cheaper at
scale and has no egress charges; Cloudinary is easier if you'd rather not think
about buckets.

**Option A — Cloudflare R2** (free: 10 GB storage, no charge for traffic)

1. Sign up at <https://dash.cloudflare.com>.
2. In the sidebar choose **R2** and add a payment card. (Cloudflare requires one
   even for the free tier. You will not be charged inside the free limits.)
3. **Create bucket** — name it `farewell-videos`.
4. Open the bucket → **Settings** → **Public access** → enable the
   **r2.dev subdomain**, and confirm. This is what makes the videos viewable
   from your site.
5. Go to **Objects** → **Upload** and drop all your MP4 files in.
6. Click any file to see its **Public URL**. It looks like:
   `https://pub-xxxxxxxxxxxx.r2.dev/idle.mp4`
7. Copy the URL for each file. You'll need all of them in Step 7.

**Option B — Cloudinary** (free tier, no card required)

1. Sign up at <https://cloudinary.com>.
2. Go to **Media Library** → **Upload** and add your MP4 files.
3. Click a file, then the **copy link** icon, to get a URL like:
   `https://res.cloudinary.com/your-name/video/upload/v1234567890/idle.mp4`
4. Copy the URL for each file.

### Step 7: Paste the URLs into the config file

1. On GitHub, open your repository → `data` → `responses.json` → click the
   **pencil icon** to edit it in the browser.
2. Find `"idleVideoUrl": "REPLACE_ME_IDLE_LOOP"` near the top and replace the
   `REPLACE_ME_IDLE_LOOP` part with your idle video's URL. Keep the quote marks:

   ```json
   "idleVideoUrl": "https://pub-xxxx.r2.dev/idle.mp4",
   ```

3. Do the same for each reaction. Every variant looks like this:

   ```json
   { "id": "greeting_a", "weight": 3, "text": "Hey! You came.", "videoUrl": "REPLACE_ME_GREETING_A" }
   ```

   - `text` — what appears in the chat bubble. Change it to whatever you like.
   - `weight` — how often this one gets chosen relative to its siblings.
   - `videoUrl` — paste the URL of the clip for this reply.

4. Anything you leave saying `REPLACE_ME` still works: the text reply appears
   and the idle video keeps playing. So you can fill these in gradually.
5. To **delete a category** you don't want, remove its whole `{ ... }` block
   from the `categories` list — including the comma before or after it. Keep
   the one with `"id": "fallback"`; the site needs it.
6. Scroll down, click **Commit changes**.

Vercel notices the commit and redeploys automatically within a minute or so.

> **Tip:** JSON is fussy about commas and quotes. If a deploy fails after you
> edit this file, paste its contents into <https://jsonlint.com> to find the
> typo.

---

## 4. Testing the live site

Open your Vercel URL on a laptop and on a phone, and work through this list:

- [ ] The idle video appears and loops without an obvious jump.
- [ ] Typing `hi` and pressing Send gives a greeting reply and plays a clip.
- [ ] The change from idle to reaction is a **fade**, not a cut.
- [ ] When the reaction finishes, it fades back to idle on its own.
- [ ] Sending several messages quickly doesn't leave the video stuck.
- [ ] The sound button under the video turns audio on and off.
- [ ] Send the same message five times — you should see different variants come
      up, roughly in line with the weights you set.
- [ ] Try something odd like *"what's your view on the new expenses policy"* —
      this is what Tier 1 and Tier 2 are for. You should still get a sensible
      category rather than the fallback.
- [ ] Try it on a phone. The video should fill the box and the input shouldn't
      zoom the page when you tap it.

**To see which tier answered:** open your browser's developer tools (F12) →
**Network** tab → send a message → click the `chat` request → **Response**.
You'll see `"tier": "tier0-keyword"`, `"tier1-embeddings"` or `"tier2-claude"`.
If nearly everything says `tier0-keyword`, your trigger phrases are doing their
job and you are spending nothing.

**Optional local check.** If you have Node.js installed (<https://nodejs.org>),
you can sanity-check your config before pushing:

```
npm run test-matching
```

It validates the JSON, tries a couple of dozen realistic messages against Tier 0,
and confirms the weighted random picking is behaving. No API keys, no internet,
no cost.

---

## 5. Editing and redeploying later

There is no separate "deploy" button to remember. **Any change committed to
GitHub redeploys the site automatically.**

To change a reply, a weight, or a video:

1. GitHub → your repository → `data/responses.json` → pencil icon.
2. Make the edit.
3. **Commit changes** at the bottom.
4. Wait roughly a minute, then refresh your site. Hard-refresh
   (`Ctrl + Shift + R`, or `Cmd + Shift + R` on Mac) if you don't see it.

To check a deploy worked: Vercel dashboard → your project → **Deployments**.
Green tick means live. Red cross means something's wrong — click it and read
the log, which will usually name the file and line at fault.

To roll back a mistake: find the last good deployment in that list, click the
**…** menu, and choose **Promote to Production**.

**Taking the site down afterwards:** Vercel → project → Settings → scroll to the
bottom → **Delete Project**. Do the same for the R2 bucket or Cloudinary assets,
and delete your API keys from the Voyage and Anthropic dashboards. Nothing bills
you after that.

---

## 6. What this costs to run

Assume a realistic scenario: **30 coworkers, averaging 20 messages each, over a
couple of weeks — about 600 messages total.**

| Service | Free allowance | What you'd use | Cost |
|---|---|---|---|
| **Vercel** (Hobby) | 100 GB bandwidth, 1M function calls/month | ~600 function calls, a few MB of HTML and CSS | **$0.00** |
| **Cloudflare R2** | 10 GB storage, 10M reads/month, **no charge for data transfer out** | ~200 MB of video, a few thousand reads | **$0.00** |
| **Voyage AI** | 200,000,000 free tokens | Maybe 20,000 tokens | **$0.00** |
| **Anthropic** | none — pay as you go | ~90 messages reaching Tier 2, at roughly $0.0005 each | **~$0.05** |

**Realistic total: about five cents of Anthropic credit.**

The catch is that Anthropic has a **$5 minimum credit purchase**, so that's the
number that actually leaves your bank account — and roughly $4.95 of it will
still be sitting there when you take the site down. Nothing recurs, nothing
renews, and nothing auto-charges.

**Three ways to make it exactly $0:**

- Don't create an Anthropic account at all. Leave `ANTHROPIC_API_KEY` unset and
  unrecognised messages get your fallback reply. Tiers 0 and 1 still work.
- Or set `"enableTier2": false` in `data/responses.json` to switch it off in
  code.
- Or use Cloudinary instead of R2 to avoid entering a card anywhere.

**How you're protected from a surprise bill regardless:**

- The Anthropic spend limit you set in Step 4 is a hard stop.
- Vercel's Hobby plan pauses the project when a limit is reached; it never bills
  you an overage.
- The site rate-limits each visitor to 25 messages a minute.
- Messages are capped at 400 characters, so no one can send a giant prompt.
- Tier 1 and Tier 2 only ever run when the free Tier 0 has already failed, and
  each runs at most **one** API call per message.

---

## 7. If something goes wrong

**The page loads but the video area is a grey box.**
The idle URL isn't set or isn't public. Paste the URL straight into your browser
address bar — if it doesn't play there, the problem is with the video host, not
this site. For R2, re-check that you enabled the r2.dev public subdomain.

**Replies appear as text but no video ever plays.**
Those variants still say `REPLACE_ME`. That's the designed behaviour — fill in
`videoUrl` for them in `data/responses.json`.

**The video plays but there's no sound.**
Browsers block audio until the visitor interacts with the page. The first Send
counts as that interaction. There's also a sound toggle under the video. Check
your clips actually have an audio track — some editors export video-only.

**Everything comes back as the fallback reply.**
Either both API keys are missing (fine, but expected), or they're wrong. In
Vercel → your project → **Logs**, look for a line starting `[chat]`. It will say
`tier1 skipped`, `tier2 error: Anthropic API 401` or similar. A 401 means the
key is wrong; a 400 usually means a typo when pasting.

**A deploy failed with a red cross.**
Nine times out of ten it's a JSON typo in `data/responses.json` — a missing
comma or an unmatched quote. Check it at <https://jsonlint.com>, fix, commit.

**Messages get matched to the wrong category.**
Add more example phrases to that category's `triggers` list — that's exactly
what they're for, and each one you add is a message that gets handled free.
If unrelated things are being force-matched, raise `tier0MinScore` in the
`matching` block from `0.62` towards `0.7`.

**Everything falls through to Tier 2 (and costs money).**
Lower `tier1MinSimilarity` from `0.55` towards `0.45` so the embeddings step
accepts more matches.

---

Good luck with the leaving do.

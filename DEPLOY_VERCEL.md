# Deploy Mystic Palm to Vercel

## Step 1: Push the latest changes

The project now includes `vercel.json` for Vercel. Commit and push:

```bash
git add vercel.json server.js
git commit -m "Add Vercel deployment config"
git push
```

## Step 2: Configure Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New** → **Project**
3. Import **MinushaNimsara/Mystic-Palm** from GitHub
4. **Framework Preset:** Keep as **Other** or **Node.js** (Vercel will use `vercel.json`)

## Step 3: Add Environment Variables

Before clicking Deploy, expand **Environment Variables** and add:

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | Your Gemini API key |
| `ROBOFLOW_API_KEY` | Your Roboflow API key |

(Optional) If using Hugging Face instead of Gemini:
| `HF_TOKEN` | Your Hugging Face token |
| `HF_TEXT_MODEL` | `google/gemma-2-2b-it` |

## Step 4: Deploy

Click **Deploy**. Vercel will build and deploy your app. You'll get a URL like `mystic-palm-xxx.vercel.app`.

## Note

- **Root Directory:** Leave as `./` (project root)
- **Build Command:** Leave empty (Vercel uses the config)
- **Output Directory:** Leave empty

# DigitalOcean App Platform Deployment - Step-by-Step Guide

## Web Console Method (Recommended - No CLI needed)

### Step 1: Access DigitalOcean Dashboard
1. Go to: https://cloud.digitalocean.com
2. Login with your account

### Step 2: Create a New App
1. Click **Apps** in the left sidebar
2. Click the **Create App** button

### Step 3: Connect GitHub
1. Click **GitHub** as the source
2. If prompted, click **Authorize with GitHub**
3. Select your repository: `umerslone/Techpigeon-MediaHub-Engine-Downloader`
4. Select branch: `main`
5. Click **Next**

### Step 4: Review App Spec (CRITICAL STEP)
You should see one of these options:

**Option A: If you see "No components detected"**
1. Click **Edit App Spec** or **Upload App Spec**
2. Copy-paste the `app.yaml` content below into the text editor
3. Make sure the YAML is properly formatted (no extra spaces at start of lines)
4. Click **Save**

**Option B: If components are detected automatically**
1. Review the spec
2. Make sure it shows:
   - ✅ `frontend` service (port 3000)
   - ✅ `api` service (port 8000)
   - ✅ `redis` database
3. Click **Next**

### Step 5: Choose Plan
1. Select **Basic** plan ($5-12/month for services)
2. Review cost estimate
3. Click **Create App**

### Step 6: Wait for Deployment
- Initial deployment takes 5-10 minutes
- Monitor progress in the **Component Status** section
- Check **Live Logs** for any errors

### Step 7: Access Your Application
Once deployed, you'll see public URLs:
- **Frontend**: `https://mediahub-frontend-xxxxx.ondigitalocean.app`
- **Backend API**: `https://mediahub-api-xxxxx.ondigitalocean.app`
- **API Docs**: `https://mediahub-api-xxxxx.ondigitalocean.app/docs`

---

## App Spec Configuration (Use if "No components detected" appears)

Copy this entire content and paste it into the App Spec editor:

```yaml
name: mediahub
services:
  - name: frontend
    github:
      branch: main
      deploy_on_push: true
      repo: umerslone/Techpigeon-MediaHub-Engine-Downloader
    source_dir: pwa-frontend
    build_command: npm ci && npm run build
    run_command: npm start
    http_port: 3000
    envs:
      - key: NEXT_PUBLIC_API_URL
        value: ${api.PUBLIC_URL}
      - key: NODE_ENV
        value: production

  - name: api
    github:
      branch: main
      deploy_on_push: true
      repo: umerslone/Techpigeon-MediaHub-Engine-Downloader
    source_dir: backend
    dockerfile_path: Dockerfile
    http_port: 8000
    envs:
      - key: REDIS_HOST
        value: ${redis.HOSTNAME}
      - key: REDIS_PORT
        value: "6379"
      - key: CACHE_TTL
        value: "3600"
      - key: MAX_CACHE_SIZE
        value: "5000"
      - key: ANALYSIS_TIMEOUT
        value: "60"
      - key: MAX_RETRIES
        value: "3"
      - key: REQUEST_TIMEOUT
        value: "30"
      - key: PROMETHEUS_ENABLED
        value: "true"

databases:
  - name: redis
    engine: REDIS
    version: "7"
    production: true

static_sites:
  - name: browser-extension
    source_dir: browser-extension
    github:
      branch: main
      deploy_on_push: true
      repo: umerslone/Techpigeon-MediaHub-Engine-Downloader
```

---

## Troubleshooting

### "No components detected" Error
1. Make sure `app.yaml` is at the **root** of your repository ✅
2. Verify `package.json` exists in `pwa-frontend/` ✅
3. Verify `requirements.txt` exists in `backend/` ✅
4. Verify `Dockerfile` exists in `backend/` ✅
5. Try uploading the spec manually (see Step 4, Option A)

### Build Fails
- Check **Live Logs** for specific error messages
- Verify all dependencies in `requirements.txt` (backend)
- Verify `package.json` has all required dependencies (frontend)

### Components Won't Start
- Check environment variables are set correctly
- Verify Redis connection: `REDIS_HOST` and `REDIS_PORT`
- Check port 3000 (frontend) and 8000 (backend) are not blocked

### Auto-Deploy Not Working
- Make sure `deploy_on_push: true` is set in `app.yaml`
- Verify GitHub integration has permission to your repo
- Check DigitalOcean webhooks in your GitHub repo settings

---

## Monitoring & Management

### View Logs
1. Click your app in the Apps dashboard
2. Click on each service (frontend, api)
3. Go to **Runtime Logs** tab
4. View real-time output

### Check Service Status
1. Go to your app
2. Look at **Component Status** section
3. Green = healthy, Red = error

### Update Configuration
1. Click **Settings** → **App Spec**
2. Edit the YAML as needed
3. Click **Save** → **Deploy**

### Environment Variables
1. Click **Settings** → **Environment**
2. Add/edit variables
3. Changes trigger automatic redeployment

---

## Auto-Deploy Setup

Every time you push to the `main` branch, DigitalOcean will:
1. Detect the push via GitHub webhook
2. Build new containers
3. Deploy updated services
4. Keep downtime minimal

**To deploy changes:**
```bash
git add .
git commit -m "Your changes"
git push origin main
```

DigitalOcean will automatically detect and deploy!

---

## Estimated Monthly Costs

- **App Platform (2 services)**: $5-12
- **Redis Database**: $15-30
- **Bandwidth**: ~$0.01/GB
- **Total**: $20-45/month

---

## Support & Docs

- DigitalOcean Docs: https://docs.digitalocean.com/products/app-platform/
- App Spec Reference: https://docs.digitalocean.com/products/app-platform/references/app-spec/
- GitHub Integration: https://docs.digitalocean.com/products/app-platform/how-to/github/

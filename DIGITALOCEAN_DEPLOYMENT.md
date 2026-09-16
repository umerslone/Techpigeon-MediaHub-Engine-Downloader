# DigitalOcean App Platform Deployment Guide

This guide will walk you through deploying your MediaHub Engine Downloader to DigitalOcean App Platform.

## Prerequisites

- ✅ DigitalOcean Account (with billing set up)
- ✅ GitHub Repository (already pushed: `umerslone/Techpigeon-MediaHub-Engine-Downloader`)
- ✅ `app.yaml` configured with correct GitHub repo details

## Deployment Steps

### Step 1: Login to DigitalOcean

1. Go to [DigitalOcean Console](https://cloud.digitalocean.com)
2. Sign in with your account credentials

### Step 2: Create a New App

1. Click **Apps** in the left sidebar
2. Click **Create App**
3. Select **GitHub** as the source
4. Click **Authorize with GitHub** if prompted
5. Select your repository: `umerslone/Techpigeon-MediaHub-Engine-Downloader`
6. Select branch: `main`
7. Click **Next**

### Step 3: Configure App Spec

1. **Choose how to build**: Select "Autodeploy from repository"
2. **Upload app spec**: 
   - You can either:
     - Let DigitalOcean auto-detect the `app.yaml` file (recommended)
     - Or manually upload the `app.yaml` file
3. Click **Next**

### Step 4: Review Configuration

The system will show you the `app.yaml` configuration with:

**Services:**
- ✅ **frontend**: Next.js PWA (port 3000)
- ✅ **api**: FastAPI backend (port 8000)
- ✅ **browser-extension**: Static site

**Database:**
- ✅ **redis**: Redis 7 instance

**Environment Variables:**
- Frontend: `NEXT_PUBLIC_API_URL` → automatically set to backend URL
- Backend: Redis connection, cache settings, timeout configs
- All services: NODE_ENV=production, PROMETHEUS_ENABLED=true

Review and click **Next**

### Step 5: Choose Billing Plan

1. Select your desired plan (Basic tier is sufficient for testing)
2. Review estimated monthly cost
3. Click **Create App**

### Step 6: Wait for Deployment

1. DigitalOcean will automatically:
   - Build your Docker containers
   - Deploy frontend, backend, and Redis
   - Assign public URLs to each service

2. Monitor the deployment status:
   - **Component Status**: Shows build and deployment progress
   - **Live Logs**: Real-time build and runtime logs
   - Each service will have a unique `.ondigitalocean.app` domain

### Step 7: Access Your Application

Once deployment completes, you'll get URLs like:

- **Frontend**: `https://mediahub-frontend-xxxxx.ondigitalocean.app`
- **Backend API**: `https://mediahub-api-xxxxx.ondigitalocean.app`
- **API Docs**: `https://mediahub-api-xxxxx.ondigitalocean.app/docs`
- **Backend Health**: `https://mediahub-api-xxxxx.ondigitalocean.app/health`

## Environment Variables Reference

### Frontend (PWA)
```
NEXT_PUBLIC_API_URL=${api.PUBLIC_URL}    # Automatically set to backend URL
NODE_ENV=production
```

### Backend (FastAPI)
```
REDIS_HOST=${redis.HOSTNAME}              # Redis hostname
REDIS_PORT=6379                           # Redis port
CACHE_TTL=3600                            # Cache time-to-live (seconds)
MAX_CACHE_SIZE=5000                       # Max cached items
ANALYSIS_TIMEOUT=60                       # Analysis timeout (seconds)
MAX_RETRIES=3                             # Retry attempts
REQUEST_TIMEOUT=30                        # Request timeout (seconds)
PROMETHEUS_ENABLED=true                   # Enable metrics
```

## Monitoring & Management

### View Logs
1. In the App Platform dashboard, click on each service
2. Go to the **Runtime Logs** tab
3. View real-time output

### Manage Environment Variables
1. Click **Settings** → **Environment**
2. Add, edit, or remove variables
3. Changes trigger automatic redeployment

### Scale Your App
1. Click on a service
2. Go to **Settings** → **Instance Size and Count**
3. Increase resources or replica count
4. Changes take effect on redeploy

### Connect Custom Domain (Optional)
1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions

## Automatic Updates

With `deploy_on_push: true` in your `app.yaml`:
- Any push to the `main` branch triggers automatic deployment
- DigitalOcean will rebuild and redeploy all services
- Old deployments can be rolled back if needed

## Troubleshooting

### Build Fails
- Check the **Build Logs** tab
- Common issues:
  - Missing dependencies in `requirements.txt`
  - Node version issues (specify in `.nvmrc` or `package.json`)
  - Docker build errors

### Backend Can't Connect to Redis
- Ensure `REDIS_HOST` is set correctly (should be automatically set)
- Check Redis service status in the dashboard
- Verify firewall/networking in DigitalOcean

### Frontend Shows API Connection Errors
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Should match the backend service's public URL
- Check browser console for specific error messages

### Service Won't Start
- Check **Runtime Logs** for error messages
- Verify all required environment variables are set
- Ensure Docker port mappings are correct

## Next Steps

1. **Monitor Performance**: Use DigitalOcean's built-in monitoring
2. **Set Up Alerts**: Configure notifications for failures
3. **Add Custom Domain**: Update DNS records to point to your app
4. **Enable Backups**: For production, enable Redis backups
5. **Use CDN**: Consider DigitalOcean's Spaces CDN for static assets

## Estimated Costs (Monthly)

- **App Platform Small (1 shared CPU)**: ~$5-12
- **Redis Standard**: ~$15-30
- **Bandwidth**: ~$0.01/GB
- **Total Estimate**: $20-50/month

## Support

- DigitalOcean Documentation: https://docs.digitalocean.com/products/app-platform/
- App Platform Quickstart: https://docs.digitalocean.com/products/app-platform/getting-started/
- GitHub Integration: https://docs.digitalocean.com/products/app-platform/how-to/github/

---

**Happy Deploying! 🚀**

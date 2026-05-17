# Deployment Guide

## Option 1: Render

1. Create a GitHub repository and upload this project.
2. Go to Render and create a new Web Service.
3. Connect your GitHub repository.
4. Build command:

```bash
npm install
```

5. Start command:

```bash
npm start
```

6. Add environment variables from `.env.example`.

7. After deployment, copy your Render URL and add this to Twilio Voice Webhook:

```text
https://YOUR-RENDER-URL/voice
```

Method: POST

## Option 2: Railway

1. Upload project to GitHub.
2. Create a new Railway project.
3. Deploy from GitHub.
4. Add environment variables.
5. Set Twilio webhook to:

```text
https://YOUR-RAILWAY-URL/voice
```

Method: POST

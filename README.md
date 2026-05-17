# ClinicCall AI Final

A ready-to-test clinic AI receptionist app.

## Features

- Answers clinic phone calls using Twilio Voice
- Talks to callers using AI
- Handles clinic timings, address, fees, doctor info, and appointment requests
- Refuses medical diagnosis/treatment advice
- Detects emergency-type calls and tells caller to seek emergency help
- Saves appointment requests
- Saves recent call logs
- Includes admin dashboard

## What you still need

This app cannot work with real calls until you add:

1. Twilio account and Twilio phone number
2. OpenAI API key
3. Hosting server such as Render, Railway, VPS, or local ngrok testing

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:3000
```

## Testing with Twilio locally

Install ngrok and run:

```bash
ngrok http 3000
```

In Twilio phone number settings, set incoming voice webhook:

```text
https://YOUR-NGROK-URL/voice
```

Method: POST

## Dashboard

Open your hosted URL in browser.

Use password from:

```env
ADMIN_PASSWORD=change-this-password
```

## Important

This app is for receptionist tasks only. It must not diagnose patients, prescribe medicines, or replace clinical staff.

# Spark Analytics Hub

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "@secret:GOOGLE_API_KEY ",
  authDomain: "silvex-ai.firebaseapp.com",
  databaseURL: "https://silvex-ai-default-rtdb.firebaseio.com",
  projectId: "silvex-ai",
  storageBucket: "silvex-ai.firebasestorage.app",
  messagingSenderId: "343959828375",
  appId: "1:343959828375:web:6d2990763b1f3ea8b576d2",
  measurementId: "G-B1MPW2N31F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);


add this firebase {dont add supabase

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://silvex-ai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d5d24e50-7a11-418f-921c-119bc81ac2f5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

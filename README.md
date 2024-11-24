
# GlobalConnect

GlobalConnect is an advanced video calling web application that enables seamless communication across the globe. With built-in live translation powered by APIs, users can connect effortlessly regardless of language barriers.

---

## Features

### 🛡️ **User Authentication**
- **Login:** Secure user authentication using Firebase.
- **Register:** Create a new account to access the application.

### 🤝 **Friend Management**
- **Add Friend:** Search for friends by name and add them to your contact list.
- **Remove Friend:** Manage your friend list by removing connections.

### 📞 **Video Calling**
- **Standard Call:** High-quality video and audio calling without translation.
- **Call with Translation:**  
  - Enable live translation during video calls.
  - Set input and output languages for seamless communication.

---

## Technologies Used

### **Frontend**
- **React** (with **Vite**): Fast and modern frontend framework for building the UI.
- **Tailwind CSS**: Utility-first CSS framework for responsive and elegant design.

### **Backend**
- **Firebase Authentication**: For secure login and registration.
- **Firebase Firestore**: For storing user data and managing friend connections.

### **Real-time Communication**
- **WebRTC**: Enables real-time video and audio streaming between users.

### **Translation API**
- **Rapid API**: Integrates live language translation features.

---

## Workflow Overview

1. **User Authentication**  
   - Users can log in or register through Firebase Authentication.

2. **Friend Management**  
   - Search and add friends by name.  
   - Remove friends from the list as needed.

3. **Video Calling Options**  
   - Start a **Standard Call** or a **Call with Translation**.  
   - Set preferred languages for translation (Input and Output).

4. **Live Translation**  
   - Translate conversation in real time during the call, ensuring effective communication across languages.

---

# Installation Guide for GlobalConnect

Welcome to the installation guide for **GlobalConnect**, a video calling app with live translation. Follow the steps below to set up the project on your local machine.

---

## Prerequisites

1. **Node.js** (v16 or above): [Download here](https://nodejs.org).  
2. **Git**: [Download here](https://git-scm.com).  
3. **Firebase Project**:
   - Set up [Authentication](https://firebase.google.com/docs/auth) and [Firestore Database](https://firebase.google.com/docs/firestore).
4. **Rapid API Key**: Obtain from [Rapid API](https://rapidapi.com).

---

## Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/SAASIMAHMEDW/GLOBAL_CONNECT_WEBAPP.git
   cd GLOBAL_CONNECT_WEBAPP
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   - Create a `.env` file in the root directory.
   - Add the following variables:
     ```env
     VITE_RAPID_API_KEY=your-rapid-api-key
     ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

5. **Open in Browser**:
   Navigate to [http://localhost:5173/](http://localhost:5173/) (or the port displayed in your terminal).

---

## Firebase Setup Guide

1. Go to the [Firebase Console](https://console.firebase.google.com) and create a new project.  
2. Enable **Authentication**:
   - Navigate to the **Authentication** tab.
   - Click **Get Started** and enable the desired sign-in providers (e.g., Email/Password).
3. Enable **Firestore Database**:
   - Go to the **Firestore Database** tab.
   - Click **Create Database** and select the desired security rules (e.g., test mode during development).
4. Copy your Firebase configuration to `firebase-config.js`:
   ```javascript
   // src/config/firebase.js
   export const firebaseConfig = {
       apiKey: "your-api-key",
       authDomain: "your-auth-domain",
       projectId: "your-project-id",
       storageBucket: "your-storage-bucket",
       messagingSenderId: "your-messaging-sender-id",
       appId: "your-app-id"
   };
   ```

---

## Environment Variables

| Variable Name        | Description                     | Example Value           |
|----------------------|---------------------------------|-------------------------|
| `VITE_RAPID_API_KEY` | Rapid API Key for translation   | `your-rapid-api-key`    |
| `FIREBASE_API_KEY`   | Firebase project API key        | `your-firebase-api-key` |
| `FIREBASE_AUTH_URL`  | Firebase Authentication domain  | `your-auth-domain`      |

Refer to the `.example.env` file for guidance.

---

## Troubleshooting

### Common Issues:
- **Error: "Port 5173 is already in use"**  
  Use the alternate port displayed in the terminal or free the port.

- **Translation Not Working**  
  Verify your Rapid API key and subscription.

- **Firebase Errors**  
  Ensure your Firebase project credentials are correct and the required APIs are enabled.

<!-- For other issues, refer to [GitHub Issues](https://github.com/SAASIMAHMEDW/GLOBAL_CONNECT_WEBAPP/issues). -->

---

## Future Enhancements

- Support for group video calls.
- Advanced friend search with filters like location or interests.
- Voice-only translation mode for audio calls.
- Push notifications for missed calls or friend requests.

---

<!-- ## Contributing

Contributions are welcome! Please follow these steps to contribute:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-branch-name`).
3. Commit your changes (`git commit -m "Add feature description"`).
4. Push to your branch (`git push origin feature-branch-name`).
5. Open a pull request on GitHub.

For any queries, feel free to reach out in the [Issues](https://github.com/SAASIMAHMEDW/GLOBAL_CONNECT_WEBAPP/issues) section. -->


## Acknowledgements

- [Firebase](https://firebase.google.com) for authentication and database services.
- [Rapid API](https://rapidapi.com) for live translation API integration.
- [WebRTC](https://webrtc.org) for real-time communication.
- [Tailwind CSS](https://tailwindcss.com) for modern and responsive design.

---

## Live Demo

[Explore the Live Demo Here](https://global-connect-webapp.vercel.app/)

---

Thank you for using **GlobalConnect**! 🚀

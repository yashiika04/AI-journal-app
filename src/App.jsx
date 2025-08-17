import React, { useState, useEffect } from 'react';
import './styles.css'; 

import {initializeApp} from 'firebase/app';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from 'firebase/auth';
import{
    getFirestore,
    collection,
    addDoc,
    query,
    onSnapshot,
    orderBy,
    doc,
    updateDoc
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.FIREBASE_API_KEY,
  authDomain: import.meta.env.FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- SVG Icons ---
const JournalIcon = ({ style }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style = {style}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
);

const LoaderIcon = () => (
    <svg className="animate-spin" style={{height: '1.25rem', width: '1.25rem', color: 'white'}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle style={{opacity: 0.25}} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path style={{opacity: 0.75}} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        {/* single card that contains header + form */}
        <div className="login-box">
          <div className="login-header">
            <JournalIcon style={{ height: '2rem', width: '2rem' }} />
            <h1>AI Journal</h1>
          </div>

          <h2>{isLogin ? 'Welcome Back' : 'Create Your Account'}</h2>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <input type="email" placeholder="Email" value={email} onChange={(e)=> setEmail(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="error-message">{error}</p>}
            <button type="submit" className="submit-button">
              {isLogin ? 'Log In' : 'Sign Up'}
            </button>
          </form>

          <p className="toggle-auth">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button type="button" onClick={() => {setIsLogin(!isLogin); setError('');}}>
              {isLogin ? ' Sign Up' : ' Log In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}



// --- Journal Component ---
// This is the main app screen after logging in.
function JournalScreen({ user }) {
    const [entries, setEntries] = useState([]);
    const [newEntry, setNewEntry] = useState('');
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState('');

    // --- Fetch entries from Firestore in real-time ---
    useEffect(() => {
      if (!user) return;
      const entriesCollection = collection(db, "users", user.uid, "entries");
      const q = query(entriesCollection, orderBy("date", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
          const userEntries = snapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data() 
          }));
          setEntries(userEntries);
          if (userEntries.length > 0 && !selectedEntry) {
              setSelectedEntry(userEntries[0]);
          } else if (userEntries.length === 0) {
              setSelectedEntry(null);
          }
      }, (error) => {
          console.error("Firestore snapshot error:", error);
      });

      return () => unsubscribe();
  }, [user, selectedEntry]);

    // --- Add a new entry to Firestore ---
    const handleAddEntry = async () => {
        if(newEntry.trim() === '') return;
        const entriesCollection = collection(db, "users", user.uid, "entries");
        await addDoc(entriesCollection, {
            text: newEntry,
            date: new Date().toISOString(),
            analysis: null 
        });
        setNewEntry('');
    };

    const handleLogout = () => {
        signOut(auth);
    };

    const handleAnalyze = async () => {
        if(!selectedEntry || !selectedEntry.text) return;

        setIsLoading(true);
        setAnalysisError('');

        try{
            const prompt = `You are a compassionate mental health assistant. Analyze the following journal entry. Provide a supportive reflection, identify key emotional themes, and offer a gentle suggestion or a question for deeper thought. Do not give medical advice. Keep the tone warm and empathetic. The user's entry is: "${selectedEntry.text}"`;

            const apiKey = import.meta.env.GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const payload = {
                contents: [{ parts: [{text: prompt}] }],
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API call failed with status: ${response.status}`);
            }

            const result = await response.json();
            const analysisText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!analysisText) {
                throw new Error("Invalid response structure from API.");
            }

            const entryRef = doc(db, "users", user.uid, "entries", selectedEntry.id);
            await updateDoc(entryRef, {
                analysis: analysisText
            });
        }catch (error) {
            console.error("Error analyzing entry:", error);
            setAnalysisError("Failed to get insights. Please try again later.");
        } finally{
            setIsLoading(false);
        }
    };

    return (
        <div className="journal-screen">
            {/* Left Sidebar: Entry List */}
            <div className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-title">
                        <JournalIcon style={{height: '1.5rem', width: '1.5rem'}} />
                        <h1>My Journal</h1>
                    </div>
                    <button onClick={handleLogout} className="logout-button">Logout</button>
                </div>
                <div className="entry-list">
                    {entries.map(entry => (
                        <div key={entry.id} onClick={() => setSelectedEntry(entry)} className={`entry-item ${selectedEntry?.id === entry.id ? 'selected' : ''}`}>
                            <p className="entry-date">{new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
                            <p className="entry-excerpt">{entry.text}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content: Selected Entry and Analysis */}
            <div className="main-content">
                <div className="content-viewer">
                    {selectedEntry ? (
                        <div className="content-viewer-inner">
                            <div className="entry-display">
                                <p className="date-header">{new Date(selectedEntry.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                <div className="text-box">
                                    <p>{selectedEntry.text}</p>
                                </div>
                            </div>
                            
                            <div className="reflection-section">
                                <h2>AI Reflection</h2>
                                {selectedEntry.analysis ? (
                                    <div className="reflection-box" dangerouslySetInnerHTML={{ __html: selectedEntry.analysis.replace(/\*\*(.*?)\*\*/g, '<h3>$1</h3>').replace(/\n/g, '<br />') }}></div>
                                ) : (
                                    <div className="reflection-box no-reflection-box">
                                        <p>No reflection yet for this entry.</p>
                                        <button onClick={handleAnalyze} disabled={isLoading} className="get-reflection-button">
                                            {isLoading ? <LoaderIcon /> : 'Get Reflection'}
                                        </button>
                                        {analysisError && <p className="analysis-error">{analysisError}</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p>Select an entry to read, or write a new one below.</p>
                        </div>
                    )}
                </div>
                
                <div className="new-entry-form">
                     <div className="new-entry-form-inner">
                        <textarea value={newEntry} onChange={(e) => setNewEntry(e.target.value)} rows="4" placeholder="Write about your day..."></textarea>
                        <button onClick={handleAddEntry} className="save-entry-button">
                            Save New Entry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Main App Component ---
// This component will decide whether to show the Login or Journal screen.
export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // --- Listen to auth state changes ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div className="loading-screen"><p>Loading...</p></div>;
    }

    if(!user){
        return <LoginScreen />;
    }

    return <JournalScreen user={user} />;
}

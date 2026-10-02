import { useEffect, useState } from "react";

type SystemStatus = {
  application: string;
  backend: string;
  database: string;
};

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/meta/status")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(setStatus)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <main>
      <h1>WealthMaster</h1>
      <p>System connectivity check</p>

      {error && <p>Connection failed: {error}</p>}

      {!status && !error && <p>Checking services…</p>}

      {status && (
        <ul>
          <li>Frontend: UP</li>
          <li>Backend: {status.backend}</li>
          <li>Database: {status.database}</li>
        </ul>
      )}
    </main>
  );
}
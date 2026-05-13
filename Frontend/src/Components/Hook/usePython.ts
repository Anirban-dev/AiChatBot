import { useEffect, useRef, useState } from 'react';

export const usePython = () => {
    const workerRef = useRef<Worker | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // 1. Initialize the Worker
        // Note: The path must match your worker file location
        workerRef.current = new Worker(
            new URL('../../Workers/pyodide.ts', import.meta.url),
            { type: 'module' }
        );

        // 2. Listen for the "READY" signal or Prints
        workerRef.current.onmessage = (event) => {
            const { type } = event.data;
            if (type === 'READY') {
                setIsReady(true);
                console.log("Python Sandbox is live!");
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const runCode = (code: string, timeoutMs = 10000): Promise<any> => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) return reject("Worker not initialized");

            const executionId = Math.random().toString(36).substring(7);

            // KILL SWITCH
            const timer = setTimeout(() => {
                // If it takes too long, we have to kill the worker and restart it
                workerRef.current?.terminate();

                // Restart the worker so the next chat message still works
                workerRef.current = new Worker(
                    new URL('../Workers/piodide.ts', import.meta.url),
                    { type: 'module' }
                );

                reject("Execution timed out (Possible infinite loop)");
            }, timeoutMs);

            const handler = (event: MessageEvent) => {
                const { type, result, error, id } = event.data;
                if (id === executionId) {
                    clearTimeout(timer); // Stop the kill switch if code finished
                    workerRef.current?.removeEventListener('message', handler);
                    type === 'RESULT' ? resolve(result) : reject(error);
                }
            };

            workerRef.current.addEventListener('message', handler);
            workerRef.current.postMessage({ code, id: executionId });
        });
    };

    return { runCode, isReady };
};
import { useEffect, useRef, useState } from 'react';

export const usePython = () => {
    const workerRef = useRef<Worker | null>(null);
    const [isReady, setIsReady] = useState(false);

    const createWorker = () => {
        const worker = new Worker(
            new URL('../../Workers/pyodide.ts', import.meta.url),
            { type: 'module' }
        );
        worker.onmessage = (event) => {
            if (event.data.type === 'READY') {
                setIsReady(true);
                console.log("Python Sandbox is live!");
            }
        };
        return worker;
    };

    useEffect(() => {
        workerRef.current = createWorker();
        return () => workerRef.current?.terminate();
    }, []);

    const runCode = (code: string, timeoutMs = 10000): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) return reject("Worker not initialized");
            if (!isReady) return reject("Python sandbox is still loading, please wait...");

            const executionId = Math.random().toString(36).substring(7);
            const stdoutLines: string[] = [];

            const timer = setTimeout(() => {
                workerRef.current?.terminate();
                workerRef.current = createWorker(); // ← reuse fixed createWorker
                reject("Execution timed out (possible infinite loop)");
            }, timeoutMs);

            const handler = (event: MessageEvent) => {
                const { type, result, error, str, id } = event.data;

                if (id !== executionId) return; // ignore unrelated messages

                // ← KEY FIX: collect stdout, don't resolve/reject yet
                if (type === 'STDOUT') {
                    stdoutLines.push(str);
                    return;
                }

                // Only resolve/reject on RESULT or ERROR
                clearTimeout(timer);
                workerRef.current?.removeEventListener('message', handler);

                if (type === 'RESULT') {
                    const printed = stdoutLines.join('\n');
                    const returned = result !== undefined && result !== null ? String(result) : '';

                    // Show print output + return value combined
                    const finalOutput = [printed, returned].filter(Boolean).join('\n') || '(no output)';
                    resolve(finalOutput);
                } else {
                    reject(error);
                }
            };

            workerRef.current.addEventListener('message', handler);
            workerRef.current.postMessage({ code, id: executionId });
        });
    };

    return { runCode, isReady };
};
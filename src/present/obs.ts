// Minimal OBS remote over obs-websocket v5 (built into OBS 28+, Tools > WebSocket Server Settings).
// The browser connects straight to OBS on the media desk; nothing goes through the Flockwise server.
import { useCallback, useEffect, useRef, useState } from 'react';

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void };

async function sha256b64(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export type ObsState = {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string;
  scenes: string[];
  current: string;
  streaming: boolean;
  recording: boolean;
};

const HOST_KEY = 'fw.obs.host';
const readHost = () => { try { return localStorage.getItem(HOST_KEY) || 'ws://localhost:4455'; } catch { return 'ws://localhost:4455'; } };

export function useObs() {
  const [state, setState] = useState<ObsState>({ status: 'idle', error: '', scenes: [], current: '', streaming: false, recording: false });
  const [host, setHost] = useState(readHost);
  const ws = useRef<WebSocket | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const seq = useRef(0);
  const patch = (p: Partial<ObsState>) => setState((s) => ({ ...s, ...p }));

  const request = useCallback((requestType: string, requestData?: Record<string, unknown>) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const sock = ws.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) { reject(new Error('Not connected to OBS')); return; }
    const requestId = `r${++seq.current}`;
    pending.current.set(requestId, { resolve, reject });
    sock.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  }), []);

  const refresh = useCallback(async () => {
    const [scenes, stream, record] = await Promise.all([request('GetSceneList'), request('GetStreamStatus'), request('GetRecordStatus')]);
    patch({
      // OBS lists scenes bottom-up; show them in the order the Scenes dock shows.
      scenes: ((scenes.scenes as { sceneName: string }[]) ?? []).map((s) => s.sceneName).reverse(),
      current: String(scenes.currentProgramSceneName ?? ''),
      streaming: !!stream.outputActive,
      recording: !!record.outputActive,
    });
  }, [request]);

  const disconnect = useCallback(() => {
    ws.current?.close();
    ws.current = null;
    patch({ status: 'idle' });
  }, []);

  const connect = useCallback((url: string, password: string) => {
    ws.current?.close();
    try { localStorage.setItem(HOST_KEY, url); } catch { /* storage blocked */ }
    setHost(url);
    patch({ status: 'connecting', error: '' });
    let sock: WebSocket;
    try { sock = new WebSocket(url); } catch { patch({ status: 'error', error: 'That address is not valid. It usually looks like ws://localhost:4455.' }); return; }
    ws.current = sock;
    sock.onmessage = async (msg) => {
      const { op, d } = JSON.parse(String(msg.data)) as { op: number; d: Record<string, any> };
      if (op === 0) {
        const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 1 | 4 | 64 }; // general, scenes, outputs
        if (d.authentication) {
          if (!password) { patch({ status: 'error', error: 'OBS asks for a password. Find it in OBS under Tools > WebSocket Server Settings.' }); sock.close(); return; }
          identify.authentication = await sha256b64((await sha256b64(password + d.authentication.salt)) + d.authentication.challenge);
        }
        sock.send(JSON.stringify({ op: 1, d: identify }));
      } else if (op === 2) {
        patch({ status: 'connected' });
        void refresh().catch(() => undefined);
      } else if (op === 7) {
        const p = pending.current.get(d.requestId);
        if (!p) return;
        pending.current.delete(d.requestId);
        if (d.requestStatus?.result) p.resolve(d.responseData ?? {});
        else p.reject(new Error(d.requestStatus?.comment || 'OBS could not do that'));
      } else if (op === 5) {
        if (d.eventType === 'CurrentProgramSceneChanged') patch({ current: d.eventData.sceneName });
        else if (d.eventType === 'StreamStateChanged') patch({ streaming: !!d.eventData.outputActive });
        else if (d.eventType === 'RecordStateChanged') patch({ recording: !!d.eventData.outputActive });
        else if (['SceneCreated', 'SceneRemoved', 'SceneNameChanged', 'SceneListChanged'].includes(d.eventType)) void refresh().catch(() => undefined);
      }
    };
    sock.onerror = () => patch({ status: 'error', error: 'Could not reach OBS. Check that OBS is open on this computer and the WebSocket server is turned on.' });
    sock.onclose = (e) => {
      if (ws.current !== sock) return;
      ws.current = null;
      for (const p of pending.current.values()) p.reject(new Error('Disconnected from OBS'));
      pending.current.clear();
      setState((s) => ({ ...s, status: s.status === 'error' ? 'error' : e.code === 4009 ? 'error' : 'idle', error: e.code === 4009 ? 'Wrong OBS password.' : s.error }));
    };
  }, [refresh]);

  useEffect(() => () => ws.current?.close(), []);

  return {
    state,
    host,
    connect,
    disconnect,
    setScene: (sceneName: string) => request('SetCurrentProgramScene', { sceneName }),
    toggleStream: () => request('ToggleStream'),
    toggleRecord: () => request('ToggleRecord'),
  };
}

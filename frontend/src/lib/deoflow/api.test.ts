import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadReference } from './api';
import { ApiError } from '@/lib/api';

/**
 * L'envoi d'un fichier ne peut pas passer par `api()` — il transporte un
 * `FormData`, pas du JSON. Il perd donc le renouvellement automatique de
 * session, et c'est précisément ce que ces tests protègent : le jeton d'accès
 * expire au bout de 15 minutes, soit moins de temps qu'il n'en faut pour
 * choisir un modèle, écrire un prompt et déposer une image.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const file = new File([new Uint8Array([1, 2, 3])], 'ref.png', { type: 'image/png' });

let fetchMock: ReturnType<typeof vi.fn>;
/** Contenu du stockage local simulé, relu à chaque appel. */
let stored: Record<string, string>;

beforeEach(() => {
  fetchMock = vi.fn();
  stored = { 'app-csrf': 'jeton-csrf' };
  // La suite tourne sous Node, sans jsdom. Ces trois objets sont tout ce que
  // le module touche du navigateur : les simuler évite d'ajouter une
  // dépendance de test pour un seul fichier.
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { protocol: 'http:' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored[k] ?? null,
    setItem: (k: string, v: string) => {
      stored[k] = v;
    },
    removeItem: (k: string) => {
      delete stored[k];
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Chemins appelés, dans l'ordre. */
function calls(): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url), 'http://x').pathname);
}

describe('envoi réussi', () => {
  it('renvoie l’URL publique sans appel superflu', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { url: 'https://cdn/ref.png' }));

    await expect(uploadReference(file)).resolves.toBe('https://cdn/ref.png');
    expect(calls()).toEqual(['/api/generations/upload']);
  });

  it('joint le jeton CSRF', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { url: 'https://cdn/a.png' }));
    await uploadReference(file);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('jeton-csrf');
    expect(init.credentials).toBe('include');
  });
});

describe('session expirée', () => {
  it('renouvelle puis rejoue l’envoi une fois', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED' })) // envoi
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED' })) // /me
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'nouveau' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u1' })) // /me rejoué
      .mockResolvedValueOnce(jsonResponse(201, { url: 'https://cdn/ok.png' })); // envoi rejoué

    await expect(uploadReference(file)).resolves.toBe('https://cdn/ok.png');
    expect(calls()).toEqual([
      '/api/generations/upload',
      '/api/auth/me',
      '/api/auth/refresh',
      '/api/auth/me',
      '/api/generations/upload',
    ]);
  });

  it('rejoue avec le jeton CSRF renouvelé', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'apres-rotation' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u1' }))
      .mockResolvedValueOnce(jsonResponse(201, { url: 'https://cdn/ok.png' }));

    await uploadReference(file);

    // Rejouer avec l'ancien jeton se ferait refuser par la double soumission.
    const last = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect((last.headers as Record<string, string>)['x-csrf-token']).toBe('apres-rotation');
  });

  it('abandonne quand la session est réellement finie', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED' }))
      .mockResolvedValueOnce(jsonResponse(401, {})) // /me
      .mockResolvedValueOnce(jsonResponse(401, {})); // refresh refusé

    // Pas de boucle de rejeu : l'utilisateur doit se reconnecter.
    const err = await uploadReference(file).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(calls().filter((p) => p === '/api/generations/upload')).toHaveLength(1);
  });
});

describe('autres refus', () => {
  it('remonte le message du serveur tel quel', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(415, { error: 'INVALID_MIME', message: 'Format non accepté : image/bmp' }),
    );

    const err = (await uploadReference(file).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('INVALID_MIME');
    expect(err.message).toBe('Format non accepté : image/bmp');
  });

  it('ne tente aucun renouvellement sur un refus qui n’est pas 401', async () => {
    // Un 413 rejoué ferait repartir les octets pour rien — coûteux en 4G.
    fetchMock.mockResolvedValueOnce(jsonResponse(413, { error: 'FILE_TOO_LARGE' }));

    await expect(uploadReference(file)).rejects.toBeInstanceOf(ApiError);
    expect(calls()).toEqual(['/api/generations/upload']);
  });

  it('donne un message lisible quand le corps n’est pas du JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));

    const err = (await uploadReference(file).catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe('L’envoi a échoué.');
  });
});

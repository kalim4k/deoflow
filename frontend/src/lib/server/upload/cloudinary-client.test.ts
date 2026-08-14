import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UploadApiOptions } from 'cloudinary';

// Options réellement transmises à Cloudinary lors du dernier envoi.
let lastOptions: UploadApiOptions | undefined;

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: (
        options: UploadApiOptions,
        cb: (err: unknown, res: unknown) => void,
      ): { end: (body: Buffer) => void } => {
        lastOptions = options;
        return {
          end: (body: Buffer) =>
            cb(null, {
              public_id: options.public_id,
              secure_url: `https://res.cloudinary.com/test/${String(options.public_id)}`,
              bytes: body.length,
            }),
        };
      },
    },
  },
}));

const { uploadBuffer, StorageNotConfiguredError, __resetCloudinarySingleton } =
  await import('./cloudinary-client');

beforeEach(() => {
  lastOptions = undefined;
  __resetCloudinarySingleton();
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret');
  vi.stubEnv('CLOUDINARY_UPLOAD_PRESET', '');
});

describe('type MIME transmis à Cloudinary', () => {
  it('passe par `context` et jamais par `metadata`', async () => {
    // `metadata` est la métadonnée STRUCTURÉE de Cloudinary : ses champs
    // doivent exister dans le compte avant tout envoi. L'utiliser cassait
    // 100 % des envois sur un compte neuf, avec
    // « Metadata External IDs do not exist ». `context` est libre.
    await uploadBuffer('references/u1/abc', Buffer.from('octets'), 'image/png');

    expect(lastOptions?.context).toEqual({ mime: 'image/png' });
    expect(lastOptions).not.toHaveProperty('metadata');
  });

  it('n’envoie aucun contexte quand le type est inconnu', async () => {
    await uploadBuffer('references/u1/def', Buffer.from('octets'), '');
    expect(lastOptions).not.toHaveProperty('context');
  });

  it('laisse Cloudinary déduire la nature du fichier', async () => {
    // `auto` couvre image / vidéo / audio d'un seul chemin de code : les
    // références du catalogue mélangent les trois.
    await uploadBuffer('references/u1/ghi', Buffer.from('octets'), 'video/mp4');
    expect(lastOptions?.resource_type).toBe('auto');
  });
});

describe('résultat', () => {
  it('renvoie l’identifiant, l’URL https et la taille', async () => {
    const res = await uploadBuffer('references/u1/jkl', Buffer.from('douze octets'), 'image/webp');

    expect(res.publicId).toBe('references/u1/jkl');
    expect(res.secureUrl).toMatch(/^https:\/\//);
    expect(res.bytes).toBe(Buffer.from('douze octets').length);
  });
});

describe('stockage non configuré', () => {
  it('lève une erreur typée dès qu’une des trois clés manque', async () => {
    for (const missing of [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]) {
      __resetCloudinarySingleton();
      vi.stubEnv(missing, '');
      // La route traduit cette erreur en 503 : sans le type, elle renverrait
      // un 502 « panne du stockage » pour une simple absence de configuration.
      await expect(uploadBuffer('k', Buffer.from('x'), 'image/png')).rejects.toBeInstanceOf(
        StorageNotConfiguredError,
      );
      vi.stubEnv(missing, 'test-value');
    }
  });

  it('ne fait jamais figurer une valeur de clé dans le message', async () => {
    __resetCloudinarySingleton();
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    const err = await uploadBuffer('k', Buffer.from('x'), 'image/png').catch((e: Error) => e);
    // Le message part dans Sentry : il nomme les variables, jamais leur contenu.
    expect((err as Error).message).not.toContain('test-cloud');
    expect((err as Error).message).not.toContain('test-key');
  });
});

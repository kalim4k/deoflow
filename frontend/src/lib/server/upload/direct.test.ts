import { describe, it, expect, vi, beforeEach } from 'vitest';

const resource = vi.fn();
const destroy = vi.fn().mockResolvedValue({ result: 'ok' });
const sign = vi.fn().mockReturnValue('signature-calculee');

vi.mock('@/lib/server/upload/cloudinary-client', () => ({
  getCloudinary: () => ({
    config: () => ({ api_key: 'cle', api_secret: 'secret', cloud_name: 'deoflow-test' }),
    utils: { api_sign_request: sign },
    api: { resource },
    uploader: { destroy },
  }),
  uploadPreset: () => null,
}));

const { DirectUploadError, completeDirectUpload, signDirectUpload } = await import('./direct');

const USER = 'user-1';
const ID = `references/${USER}/0b7c1e2a-3f4d-4e5f-8a9b-0c1d2e3f4a5b`;

beforeEach(() => {
  resource.mockReset();
  destroy.mockClear();
  sign.mockClear();
});

describe('signature d’un envoi direct', () => {
  it('signe un identifiant dans le dossier de l’utilisateur, formats verrouillés', () => {
    const signed = signDirectUpload({ userId: USER, mimeType: 'video/quicktime', sizeBytes: 20e6 });
    expect(signed.uploadUrl).toBe('https://api.cloudinary.com/v1_1/deoflow-test/video/upload');
    expect(signed.fields.public_id).toMatch(new RegExp(`^references/${USER}/[0-9a-f-]{36}$`));
    // Signé : Cloudinary refusera tout fichier dont le format DÉTECTÉ diffère.
    expect(signed.fields.allowed_formats).toBe('mov');
    expect(signed.fields.signature).toBe('signature-calculee');
    expect(signed.fields.api_key).toBe('cle');
    // Le secret ne quitte jamais le serveur.
    expect(JSON.stringify(signed)).not.toContain('secret');
    const [params] = sign.mock.calls[0] as [Record<string, string>];
    expect(Object.keys(params).sort()).toEqual(['allowed_formats', 'public_id', 'timestamp']);
  });

  it('refuse un type qu’aucun modèle n’accepte', () => {
    expect(() =>
      signDirectUpload({ userId: USER, mimeType: 'application/pdf', sizeBytes: 1000 }),
    ).toThrow(DirectUploadError);
  });

  it('refuse un fichier au-delà du plafond', () => {
    expect(() =>
      signDirectUpload({ userId: USER, mimeType: 'video/mp4', sizeBytes: 500 * 1024 * 1024 }),
    ).toThrow(expect.objectContaining({ code: 'FILE_TOO_LARGE' }));
  });
});

describe('enregistrement d’un envoi direct', () => {
  it('relit taille, format et adresse chez Cloudinary', async () => {
    resource.mockResolvedValue({
      format: 'mp4',
      bytes: 12_000_000,
      duration: 9.4,
      secure_url: 'https://res.cloudinary.com/deoflow-test/video/upload/v1/x.mp4',
    });
    const done = await completeDirectUpload({ userId: USER, publicId: ID, mimeType: 'video/mp4' });
    expect(done).toEqual({
      publicId: ID,
      url: 'https://res.cloudinary.com/deoflow-test/video/upload/v1/x.mp4',
      sizeBytes: 12_000_000,
      durationSeconds: 9.4,
    });
    expect(resource).toHaveBeenCalledWith(ID, { resource_type: 'video', media_metadata: true });
  });

  it('refuse un identifiant hors du dossier de l’utilisateur', async () => {
    await expect(
      completeDirectUpload({
        userId: USER,
        publicId: 'references/autre/0b7c1e2a-3f4d-4e5f-8a9b-0c1d2e3f4a5b',
        mimeType: 'video/mp4',
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
    expect(resource).not.toHaveBeenCalled();
  });

  it('supprime un fichier dont le format réel dément le type annoncé', async () => {
    resource.mockResolvedValue({ format: 'webm', bytes: 1000, secure_url: 'https://x' });
    await expect(
      completeDirectUpload({ userId: USER, publicId: ID, mimeType: 'video/mp4' }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_CONTENT' });
    expect(destroy).toHaveBeenCalledWith(ID, { resource_type: 'video', invalidate: true });
  });

  it('répond « introuvable » quand Cloudinary ne connaît pas le fichier', async () => {
    resource.mockRejectedValue(new Error('not found'));
    await expect(
      completeDirectUpload({ userId: USER, publicId: ID, mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
  });
});

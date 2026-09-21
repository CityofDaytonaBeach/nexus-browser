export interface StorageConfig {
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  r2AccountId?: string;
  r2Bucket?: string;
}

export function createStorageIntegration(config: StorageConfig = {}) {
  return {
    name: 'storage',
    category: 'files',
    features: [
    "s3",
    "cloudflare-r2",
    "supabase-storage",
    "firebase-storage",
    "signed-uploads"
],
    config,
  };
}

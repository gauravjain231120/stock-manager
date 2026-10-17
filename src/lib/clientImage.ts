/**
 * Automatically resize and compress image files on the client before uploading.
 * Reduces 10MB+ camera photos to ~200-400KB in milliseconds while maintaining high visual quality.
 * Prevents Vercel 4.5MB serverless payload limit errors and ensures instant uploads.
 */
export async function compressImageIfNeeded(file: File, maxDimension = 1600, quality = 0.85): Promise<File> {
  if (!file || !file.type.startsWith('image/') || file.size <= 400 * 1024) {
    return file;
  }

  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) return resolve(file);
            const newName = file.name.replace(/\.[^.]+$/, '.jpg');
            resolve(new File([blob], newName, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

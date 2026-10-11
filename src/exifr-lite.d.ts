// exifr's lite build (JPEG + HEIC, EXIF/GPS) has the same API as the package root.
declare module 'exifr/dist/lite.esm.mjs' {
  import exifr from 'exifr';
  export default exifr;
}

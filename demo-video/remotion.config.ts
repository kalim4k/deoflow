import { Config } from '@remotion/cli/config';

// Rendu destiné au web : H.264 dans un MP4, lisible partout sans extension.
//
// Images intermédiaires en PNG, pas en JPEG : depuis du JPEG (plage complète),
// l'ffmpeg de Remotion sort du `yuvj420p` même quand on demande `yuv420p`, et
// certains décodeurs Android d'entrée de gamme — ceux de la cible — ignorent le
// drapeau de plage et faussent les contrastes. Le PNG est plus lent à rendre,
// mais donne un vrai `yuv420p`.
Config.setVideoImageFormat('png');
Config.setCodec('h264');

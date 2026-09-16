// Graphics style switch shared by the sprite bakers. 'pixel' = pixel art (default), 'model' = jointed low-poly look, 'flat' = the original paper-doll drawings.
export const GFX = { style: 'pixel' };
export const GFX_STYLES = ['pixel', 'model', 'flat'];
export function isPixel() { return GFX.style === 'pixel'; }

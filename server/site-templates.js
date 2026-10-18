// A catalog row is not enough: only implemented and tested template/niche pairs are enabled.
export const MINI_SITE = 'gradefy-minisite';
export const supportsSite = (template, niche) =>
  niche === 'barbershop' && ['barber-classic', MINI_SITE].includes(template);
export const galleryLimit = (template) => (template === MINI_SITE ? 5 : 40);

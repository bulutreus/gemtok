/**
 * TikTok / TikFinity / GemTok köprüsü — izleyici profil fotoğrafı URL çözümü.
 */

function extractHttpUrl(v) {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    return '';
  }
  if (!v || typeof v !== 'object') return '';
  const o = v;
  if (typeof o.url === 'string') {
    const t = o.url.trim();
    if (t.startsWith('http')) return t;
  }
  const list = o.url_list ?? o.urlList;
  if (Array.isArray(list)) {
    for (const item of list) {
      const inner = extractHttpUrl(item);
      if (inner) return inner;
    }
  }
  if (Array.isArray(o.url)) {
    for (const item of o.url) {
      const inner = extractHttpUrl(item);
      if (inner) return inner;
    }
  }
  return '';
}

function pickProfileImageUrl(...candidates) {
  for (const c of candidates) {
    const u = extractHttpUrl(c);
    if (u) return u;
  }
  return '';
}

function extractViewerProfileUrl(data) {
  if (!data || typeof data !== 'object') return '';
  const d = data;
  const u = d.user && typeof d.user === 'object' ? d.user : null;
  const sender = d.sender && typeof d.sender === 'object' ? d.sender : null;
  const member = d.member && typeof d.member === 'object' ? d.member : null;
  const user = u || sender || member;

  return pickProfileImageUrl(
    d.avatarUrl,
    d.profileUrl,
    d.profilePictureUrl,
    d.profile_picture_url,
    d.profileImage,
    d.userPhotoUrl,
    d.profilePicture,
    user?.profilePictureUrl,
    user?.avatarUrl,
    user?.profile_url,
    user?.profile_picture_url,
    user?.profilePicture,
    user?.avatarThumb,
    user?.avatar_thumb,
    user?.profilePictureLarge,
    user?.profilePictureMedium,
    user?.avatarJpg,
    user?.userPhotoUrl,
    user?.profileImage,
  );
}

module.exports = {
  extractHttpUrl,
  pickProfileImageUrl,
  extractViewerProfileUrl,
};

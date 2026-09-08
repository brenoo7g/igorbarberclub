import { useState } from 'react';

export function Avatar({
  name,
  avatar,
  large = false,
}: {
  name: string;
  avatar?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || '?';
  return (
    <span className={`client-avatar ${large ? 'profile-avatar' : ''}`}>
      {avatar && failed !== avatar ? (
        <img src={avatar} alt={`Foto de ${name}`} onError={() => setFailed(avatar)} />
      ) : (
        <span aria-label={`Perfil de ${name}`}>{initials}</span>
      )}
    </span>
  );
}

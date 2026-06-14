import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { avatarFor } from "../utils/ranking";

export function AvatarImage({
  alt,
  avatar,
  className,
  email,
  name,
}: {
  alt?: string;
  avatar?: string | null;
  className?: string;
  email: string;
  name: string;
}) {
  const fallbackAvatar = avatarFor(name, email);
  const [imageSrc, setImageSrc] = useState(avatar?.trim() || fallbackAvatar);

  useEffect(() => {
    setImageSrc(avatar?.trim() || fallbackAvatar);
  }, [avatar, fallbackAvatar]);

  return (
    <img
      src={imageSrc}
      alt={alt ?? ""}
      className={clsx("rounded-full bg-accent-soft object-cover", className)}
      onError={() => {
        if (imageSrc !== fallbackAvatar) {
          setImageSrc(fallbackAvatar);
        }
      }}
    />
  );
}

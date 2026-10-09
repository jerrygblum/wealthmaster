import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { AuthenticatorStepProps } from "../../types/componentProps";

export function useAuthenticatorStep({ setup, disabled, onSubmit }: AuthenticatorStepProps) {
  const [image, setImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [code, setCode] = useState("");
  useEffect(() => {
    let active = true;
    if (setup.otpauthUri)
      void QRCode.toDataURL(setup.otpauthUri, { width: 240, margin: 2 })
        .then((url) => {
          if (active) setImage(url);
        })
        .catch(() => {
          if (active) setQrError(true);
        });
    return () => {
      active = false;
    };
  }, [setup.otpauthUri]);

  return { image, qrError, code, setCode, setup, disabled, onSubmit };
}

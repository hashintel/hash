import id128 from "id128";

export const generateUuid = () =>
  id128.Uuid4.generate().toCanonical().toLowerCase();

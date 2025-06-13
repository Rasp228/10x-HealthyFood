import { useState } from "react";
import RecipeFormModal from "./RecipeFormModal";

export default function RecipeFormContainer() {
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    window.location.href = "/";
  };

  return <RecipeFormModal isOpen={isOpen} onClose={handleClose} />;
}

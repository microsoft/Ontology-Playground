import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  icon?: string;
}

export function Toast({ message, icon }: ToastProps) {
  return (
    <motion.div
      className="toast"
      initial={{ opacity: 0, y: 50, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 50, x: '-50%' }}
    >
      <span className="toast-icon">{icon || <CheckCircle size={20} />}</span>
      {message}
    </motion.div>
  );
}

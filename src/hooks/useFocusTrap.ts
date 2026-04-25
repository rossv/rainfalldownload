import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, isActive: boolean, onEscape?: () => void) {
    useEffect(() => {
        if (!isActive || !containerRef.current) return;

        const container = containerRef.current;
        const getFocusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

        // Focus the first focusable element when the trap activates
        const firstEl = getFocusable()[0];
        firstEl?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onEscape?.();
                return;
            }

            if (e.key !== 'Tab') return;

            const focusable = getFocusable();
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isActive, containerRef, onEscape]);
}

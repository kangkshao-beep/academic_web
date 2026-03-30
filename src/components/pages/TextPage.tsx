'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown, { type Components } from 'react-markdown';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { TextPageConfig } from '@/types/page';

interface TextPageProps {
    config: TextPageConfig;
    content: string;
    embedded?: boolean;
}

export default function TextPage({ config, content, embedded = false }: TextPageProps) {
    const [activeMedia, setActiveMedia] = useState<{ src: string; label: string } | null>(null);

    useEffect(() => {
        if (!activeMedia) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveMedia(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeMedia]);

    const markdownComponents = useMemo<Components>(() => ({
        h1: ({ children }: { children?: ReactNode }) => <h1 className="text-3xl font-serif font-bold text-primary mt-8 mb-4">{children}</h1>,
        h2: ({ children }: { children?: ReactNode }) => <h2 className="text-2xl font-serif font-bold text-primary mt-8 mb-4 border-b border-neutral-200 dark:border-neutral-800 pb-2">{children}</h2>,
        h3: ({ children }: { children?: ReactNode }) => <h3 className="text-xl font-semibold text-primary mt-6 mb-3">{children}</h3>,
        p: ({ children }: { children?: ReactNode }) => <p className="mb-4 last:mb-0">{children}</p>,
        ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc list-inside mb-4 space-y-1 ml-4">{children}</ul>,
        ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal list-inside mb-4 space-y-1 ml-4">{children}</ol>,
        li: ({ children }: { children?: ReactNode }) => <li className="mb-1">{children}</li>,
        a: ({ href, children }: { href?: string; children?: ReactNode }) => {
            if (href?.startsWith('media:')) {
                const mediaSrc = href.replace(/^media:/, '');
                const label = typeof children === 'string' ? children : 'Media';

                return (
                    <button
                        type="button"
                        onClick={() => setActiveMedia({ src: mediaSrc, label })}
                        className="text-accent font-medium transition-all duration-200 rounded hover:bg-accent/10 hover:shadow-sm"
                    >
                        {children}
                    </button>
                );
            }

            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent font-medium transition-all duration-200 rounded hover:bg-accent/10 hover:shadow-sm"
                >
                    {children}
                </a>
            );
        },
        img: ({ src, alt, ...props }) => (
            // Render markdown images with consistent sizing for CV photos and similar assets.
            // eslint-disable-next-line @next/next/no-img-element
            <img
                {...props}
                src={typeof src === 'string' ? src : ''}
                alt={alt || ''}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm my-6"
            />
        ),
        blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote className="border-l-4 border-accent/50 pl-4 italic my-4 text-neutral-600 dark:text-neutral-500">
                {children}
            </blockquote>
        ),
        strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-primary">{children}</strong>,
        em: ({ children }: { children?: ReactNode }) => <em className="italic text-neutral-600 dark:text-neutral-500">{children}</em>,
    }), []);

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className={embedded ? "" : "max-w-3xl mx-auto"}
            >
                <h1 className={`${embedded ? "text-2xl" : "text-4xl"} font-serif font-bold text-primary mb-4`}>{config.title}</h1>
                {config.description && (
                    <p className={`${embedded ? "text-base" : "text-lg"} text-neutral-600 dark:text-neutral-500 mb-8 max-w-2xl`}>
                        {config.description}
                    </p>
                )}
                <div className="text-neutral-700 dark:text-neutral-600 leading-relaxed">
                    <ReactMarkdown components={markdownComponents}>
                        {content}
                    </ReactMarkdown>
                </div>
            </motion.div>

            <AnimatePresence>
                {activeMedia && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 p-4 sm:p-8"
                        onClick={() => setActiveMedia(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="relative mx-auto flex h-full max-w-5xl items-center justify-center"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => setActiveMedia(null)}
                                className="absolute right-0 top-0 z-10 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
                                aria-label="Close media preview"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                            <div className="max-h-full max-w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-2xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={activeMedia.src}
                                    alt={activeMedia.label}
                                    className="max-h-[80vh] max-w-full object-contain"
                                />
                                <div className="border-t border-white/10 px-4 py-3 text-sm text-neutral-200">
                                    {activeMedia.label}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

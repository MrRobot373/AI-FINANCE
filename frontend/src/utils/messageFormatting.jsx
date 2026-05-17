import React from 'react';
import { cleanMessageText } from './messageText.js';

const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;

const trimUrlPunctuation = (url) => {
    const match = url.match(/[.,!?;:)]*$/);
    const trailing = match ? match[0] : '';
    return {
        href: trailing ? url.slice(0, -trailing.length) : url,
        trailing,
    };
};

const renderMarkdownInline = (text, keyPrefix) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);

    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
                <strong key={`${keyPrefix}-strong-${idx}`} className="font-semibold text-white">
                    {part.slice(2, -2)}
                </strong>
            );
        }

        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return (
                <em key={`${keyPrefix}-em-${idx}`} className="text-gray-400">
                    {part.slice(1, -1)}
                </em>
            );
        }

        return part;
    });
};

const renderInline = (text, keyPrefix) => {
    const parts = text.split(URL_RE);

    return parts.map((part, idx) => {
        if (/^https?:\/\//i.test(part)) {
            const { href, trailing } = trimUrlPunctuation(part);
            return (
                <React.Fragment key={`${keyPrefix}-url-${idx}`}>
                    <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200 break-all"
                    >
                        {href}
                    </a>
                    {trailing}
                </React.Fragment>
            );
        }

        return renderMarkdownInline(part, `${keyPrefix}-text-${idx}`);
    });
};

export const LoadingDots = ({ className = '' }) => (
    <div className={`flex items-center gap-2 ${className}`}>
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
);

const MessageContent = ({ content = '', className = '' }) => {
    const cleaned = cleanMessageText(content);

    if (!cleaned) {
        return <LoadingDots className="h-6" />;
    }

    const lines = cleaned.split(/\r?\n/);

    return (
        <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
            {lines.map((line, idx) => {
                const normalizedLine = line.replace(/^\s*[*-]\s+/, '');
                return (
                    <React.Fragment key={`line-${idx}`}>
                        {renderInline(normalizedLine, `line-${idx}`)}
                        {idx < lines.length - 1 ? '\n' : null}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default MessageContent;

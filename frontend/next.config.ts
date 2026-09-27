import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "react-markdown", "devlop", "hast-util-to-jsx-runtime", "comma-separated-tokens",
    "estree-util-is-identifier-name", "hast-util-whitespace", "mdast-util-mdx-expression",
    "mdast-util-from-markdown", "decode-named-character-reference", "character-entities",
    "mdast-util-to-string", "micromark", "micromark-core-commonmark", "micromark-factory-destination",
    "micromark-util-character", "micromark-util-symbol", "micromark-util-types",
    "micromark-factory-label", "micromark-factory-space", "micromark-factory-title",
    "micromark-factory-whitespace", "micromark-util-chunked", "micromark-util-classify-character",
    "micromark-util-html-tag-name", "micromark-util-normalize-identifier", "micromark-util-resolve-all",
    "micromark-util-subtokenize", "micromark-util-combine-extensions",
    "micromark-util-decode-numeric-character-reference", "micromark-util-encode",
    "micromark-util-sanitize-uri", "micromark-util-decode-string", "unist-util-stringify-position",
    "mdast-util-to-markdown", "longest-streak", "mdast-util-phrasing", "unist-util-is",
    "unist-util-visit", "unist-util-visit-parents", "zwitch", "mdast-util-mdx-jsx", "ccount",
    "parse-entities", "character-entities-legacy", "character-reference-invalid", "is-alphanumerical",
    "is-alphabetical", "is-decimal", "is-hexadecimal", "stringify-entities", "character-entities-html4",
    "vfile-message", "mdast-util-mdxjs-esm", "property-information", "space-separated-tokens",
    "unist-util-position", "html-url-attributes", "mdast-util-to-hast", "@ungap/structured-clone",
    "trim-lines", "vfile", "remark-parse", "unified", "bail", "is-plain-obj", "trough", "remark-rehype",
    "marked",
  ],
};

export default nextConfig;

// Local type shim for react-quill. The npm package `@types/react-quill`
// returns 404 from the registry at the time of authoring, so we declare the
// surface we actually consume in template-editor.tsx.
//
// ponytail: exposes only the props we use. Ceiling: if the editor starts
// using toolbar dropdowns, formats, or Quill.find(), expand this stub.

declare module "react-quill" {
  import * as React from "react";

  export interface ReactQuillProps {
    theme?: "snow" | "bubble" | string;
    modules?: Record<string, unknown>;
    value?: string;
    defaultValue?: string;
    onChange?: (value: string, delta: unknown, source: "user" | "api" | "silent") => void;
    placeholder?: string;
    readOnly?: boolean;
    className?: string;
    style?: React.CSSProperties;
  }

  const ReactQuill: React.ComponentType<ReactQuillProps> & {
    Quill?: { find: (node: HTMLElement) => unknown };
  };

  export default ReactQuill;
}

declare module "react-quill/dist/quill.snow.css";
declare module "react-quill/dist/quill.bubble.css";

import React, { createContext, useContext, useEffect, useState } from "react";
import Modal from "./Modal";

const PromptContext = createContext();

export const usePrompt = () => useContext(PromptContext);

function PromptDialog({ isOpen, title, message, placeholder, showInput = true, onSubmit, onClose }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      setValue("");
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || "Input required"}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "0.5rem 0" }}>
        {message && <p style={{ margin: 0, color: "var(--dash-ink-soft)", lineHeight: 1.5 }}>{message}</p>}
        {showInput && (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder ?? undefined}
            style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "var(--dash-radius-sm)", border: "1px solid var(--dash-border)", background: "var(--dash-surface)", color: "var(--dash-ink)", outline: "none" }}
          />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSubmit(showInput ? value : true)}
          >
            {showInput ? "Submit" : "OK"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function PromptProvider({ children }) {
  const [config, setConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    placeholder: "",
    resolve: null,
  });

  const openPrompt = ({ title, message, placeholder, showInput = true }) => {
    return new Promise((resolve) => {
      setConfig({
        isOpen: true,
        title,
        message,
        placeholder,
        showInput,
        resolve,
      });
    });
  };

  const closePrompt = () => {
    if (config.resolve) {
      config.resolve(null);
    }
    setConfig((prev) => ({ ...prev, isOpen: false, resolve: null }));
  };

  const handleSubmit = (value) => {
    if (config.resolve) {
      config.resolve(value);
    }
    setConfig((prev) => ({ ...prev, isOpen: false, resolve: null }));
  };

  return (
    <PromptContext.Provider value={{ prompt: openPrompt }}>
      {children}

      <PromptDialog
        isOpen={config.isOpen}
        title={config.title}
        message={config.message}
        placeholder={config.placeholder}
        showInput={config.showInput}
        onClose={closePrompt}
        onSubmit={handleSubmit}
      />
    </PromptContext.Provider>
  );
}
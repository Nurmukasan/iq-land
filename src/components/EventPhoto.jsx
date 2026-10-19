import React, { useState } from "react";
import "./EventPhoto.css";

export default function EventPhoto({
  src,
  alt = "",
  className = "",
  onError,
  ...imgProps
}) {
  const source = typeof src === "string" ? src.trim() : "";
  const [failedSource, setFailedSource] = useState(null);
  const classes = `event-photo ${className}`.trim();

  if (source && failedSource !== source)
    return (
      <img
        {...imgProps}
        key={source}
        src={source}
        alt={alt}
        className={classes}
        onError={(event) => {
          setFailedSource(source);
          onError?.(event);
        }}
      />
    );

  const {
    width,
    height,
    loading,
    decoding,
    fetchPriority,
    crossOrigin,
    referrerPolicy,
    srcSet,
    sizes,
    onLoad,
    ...placeholderProps
  } = imgProps;
  return (
    <div
      {...placeholderProps}
      className={`${classes} event-photo-placeholder`}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={{
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...imgProps.style,
      }}
    >
      <span className="event-photo-mark" aria-hidden="true">
        <span className="event-photo-iq">IQ</span>
        <span className="event-photo-land">LAND</span>
      </span>
    </div>
  );
}

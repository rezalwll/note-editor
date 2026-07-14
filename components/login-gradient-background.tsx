"use client";

import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_aspect;

  float glow(vec2 point, vec2 center, float size) {
    vec2 delta = (point - center) * vec2(u_aspect, 1.0);
    return exp(-dot(delta, delta) * size);
  }

  void main() {
    vec2 point = v_uv;
    float time = u_time * 0.11;

    point.x += sin(point.y * 5.2 - time * 0.8) * 0.035;
    point.y += sin(point.x * 4.4 + time) * 0.045;
    point += vec2(
      sin((point.x + point.y) * 3.4 + time * 0.55),
      cos((point.x - point.y) * 3.0 - time * 0.45)
    ) * 0.018;

    vec3 dark = vec3(0.129, 0.0, 0.392);
    vec3 purple = vec3(0.290, 0.043, 0.561);
    vec3 violet = vec3(0.486, 0.180, 1.0);
    vec3 magenta = vec3(0.910, 0.302, 1.0);
    vec3 pink = vec3(1.0, 0.561, 0.910);
    vec3 light = vec3(1.0, 0.824, 0.957);

    vec3 color = mix(light, dark, smoothstep(0.08, 0.96, point.y));

    vec2 purpleCenter = vec2(
      0.10 + sin(time * 0.34) * 0.08,
      0.48 + cos(time * 0.29) * 0.06
    );
    vec2 violetCenter = vec2(
      0.83 + cos(time * 0.27) * 0.07,
      0.61 + sin(time * 0.31) * 0.07
    );
    vec2 pinkCenter = vec2(
      0.60 + sin(time * 0.24) * 0.10,
      0.22 + cos(time * 0.22) * 0.05
    );
    vec2 magentaCenter = vec2(
      0.40 + cos(time * 0.20) * 0.08,
      0.46 + sin(time * 0.26) * 0.08
    );

    color = mix(color, purple, glow(point, purpleCenter, 2.2) * 0.82);
    color = mix(color, violet, glow(point, violetCenter, 2.8) * 0.72);
    color = mix(color, magenta, glow(point, magentaCenter, 3.3) * 0.55);
    color = mix(color, pink, glow(point, pinkCenter, 2.1) * 0.80);
    color = mix(color, light, glow(point, vec2(0.96, 0.04), 1.8) * 0.56);

    float topShade = smoothstep(0.68, 1.0, v_uv.y);
    color = mix(color, dark, topShade * 0.58);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);

  if (!shader) {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

export function LoginGradientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      premultipliedAlpha: false,
    });

    if (!gl) {
      return;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();

    if (!vertexShader || !fragmentShader || !program) {
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      if (program) gl.deleteProgram(program);
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const aspectLocation = gl.getUniformLocation(program, "u_aspect");
    const positionBuffer = gl.createBuffer();

    if (positionLocation < 0 || !positionBuffer) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = motionQuery.matches;
    let animationFrameId: number | null = null;
    let startTime: number | null = null;
    let disposed = false;
    let contextLost = false;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const mobileDensity = window.innerWidth < 768 ? 1 : 1.5;
      const pixelDensity = Math.min(window.devicePixelRatio || 1, mobileDensity);
      const nextWidth = Math.max(1, Math.round(width * pixelDensity));
      const nextHeight = Math.max(1, Math.round(height * pixelDensity));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (timestamp: number) => {
      if (disposed || contextLost || gl.isContextLost()) {
        contextLost = gl.isContextLost();
        return;
      }

      if (startTime === null) {
        startTime = timestamp;
      }

      gl.useProgram(program);
      gl.uniform1f(timeLocation, (timestamp - startTime) / 1000);
      gl.uniform1f(aspectLocation, canvas.width / Math.max(1, canvas.height));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const render = (timestamp: number) => {
      animationFrameId = null;
      draw(timestamp);

      if (
        !contextLost &&
        !prefersReducedMotion &&
        document.visibilityState === "visible"
      ) {
        animationFrameId = window.requestAnimationFrame(render);
      }
    };

    const start = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      if (contextLost) {
        return;
      }

      resize();

      if (prefersReducedMotion) {
        draw(0);
      } else if (document.visibilityState === "visible") {
        animationFrameId = window.requestAnimationFrame(render);
      }
    };

    const handleVisibilityChange = () => {
      start();
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
      startTime = null;
      start();
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionQuery.addEventListener("change", handleMotionChange);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    start();

    return () => {
      disposed = true;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery.removeEventListener("change", handleMotionChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_55%_65%,rgba(255,100,235,0.9),transparent_45%),radial-gradient(circle_at_10%_90%,rgba(120,45,255,0.9),transparent_50%),linear-gradient(145deg,#210064_0%,#4a0b8f_45%,#ffd2f4_100%)]"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block h-full w-full"
      />
    </div>
  );
}

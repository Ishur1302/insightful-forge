import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="mt-24 border-t bg-card/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <div>
          Built by{" "}
          <span className="font-medium text-foreground">Ishan Sharma</span>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/Ishur1302/"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/ishan-sharma-302741293/"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground transition-colors"
          >
            LinkedIn
          </a>
          <Link to="/" className="hover:text-foreground transition-colors">
            Mindspark
          </Link>
        </div>
      </div>
    </footer>
  );
}

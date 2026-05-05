/**
 * Spec 012 §3.3 — marketing footer. Server Component; pure links.
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-gray-50" data-testid="marketing-footer">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 text-sm sm:grid-cols-4">
        <div>
          <h4 className="mb-3 font-semibold">Product</h4>
          <ul className="space-y-2 text-gray-600">
            <li>
              <a href="/pricing" className="hover:text-black">
                Pricing
              </a>
            </li>
            <li>
              <a href="/signup" className="hover:text-black">
                Get started
              </a>
            </li>
            <li>
              <a href="/login" className="hover:text-black">
                Sign in
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold">Compare</h4>
          <ul className="space-y-2 text-gray-600">
            <li>
              <a href="/compare/manychat" className="hover:text-black">
                vs ManyChat
              </a>
            </li>
            <li>
              <a href="/compare/linkplease" className="hover:text-black">
                vs LinkPlease
              </a>
            </li>
            <li>
              <a href="/compare/linkdm" className="hover:text-black">
                vs LinkDM
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold">Legal</h4>
          <ul className="space-y-2 text-gray-600">
            <li>
              <a href="/privacy" className="hover:text-black" data-testid="footer-privacy">
                Privacy
              </a>
            </li>
            <li>
              <a href="/terms" className="hover:text-black" data-testid="footer-terms">
                Terms
              </a>
            </li>
            <li>
              <a href="/dpa" className="hover:text-black" data-testid="footer-dpa">
                DPA
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold">Contact</h4>
          <ul className="space-y-2 text-gray-600">
            <li>
              <a href="mailto:hello@automatebro.com" className="hover:text-black">
                hello@automatebro.com
              </a>
            </li>
            <li className="text-xs text-gray-500">AutomateBro · Made in India</li>
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-6xl border-t px-6 py-4 text-xs text-gray-500">
        © {year} AutomateBro. Instagram® is a trademark of Meta Platforms, Inc. AutomateBro is not
        affiliated with Meta.
      </div>
    </footer>
  );
}

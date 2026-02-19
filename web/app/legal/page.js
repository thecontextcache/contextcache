export default function LegalPage() {
  return (
    <div className="legal-wrap">
      <p className="muted" style={{ marginBottom: 8 }}>Legal</p>
      <h1>Terms &amp; Notices</h1>
      <p className="muted">Effective: 2025 · thecontextcache™</p>

      <h2>Copyright Notice</h2>
      <p>
        Copyright &copy; 2024–2025 thecontextcache™. All Rights Reserved. The &ldquo;™&rdquo;
        symbol indicates a trademark claim. TheContextCache is not currently registered with
        any trademark office, and no LLC has been formed.
      </p>

      <h2>License Grant</h2>
      <p>
        This software and associated documentation files (the &ldquo;Software&rdquo;) are
        proprietary and confidential. The Software is <strong>licensed, not sold</strong>.
      </p>

      <h2>Development License</h2>
      <p>
        During the development and alpha phase, the Software is provided for internal
        development and testing purposes only. No rights are granted to use, copy, modify,
        merge, publish, distribute, sublicense, or sell copies of the Software without
        explicit written permission from the copyright holder.
      </p>

      <h2>Restrictions</h2>
      <p>You may <strong>not</strong>:</p>
      <ul>
        <li>Use the Software for commercial or production purposes without permission</li>
        <li>Copy, modify, or create derivative works</li>
        <li>Distribute, sublicense, rent, lease, or lend the Software</li>
        <li>Reverse engineer, decompile, or disassemble the Software</li>
        <li>Remove or alter any proprietary notices or labels</li>
        <li>Use the Software in any way that violates applicable laws or regulations</li>
      </ul>

      <h2>Disclaimer of Warranty</h2>
      <p>
        THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS
        OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
        FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
        COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        In no event shall thecontextcache™ be liable for any indirect, incidental, special,
        exemplary, or consequential damages arising out of or in connection with the use of
        the Software, even if advised of the possibility of such damages.
      </p>

      <h2>Privacy</h2>
      <p>
        During the invite-only alpha, we store only the data you submit (email addresses,
        project names, memory card content). We do not sell or share your data with third
        parties. Data is stored in a self-hosted Postgres database.
      </p>

      <h2>Termination</h2>
      <p>
        This license is effective until terminated. It terminates automatically if you violate
        any of its terms. Upon termination, you must destroy all copies of the Software in
        your possession.
      </p>

      <h2>Contact</h2>
      <p>
        Questions?{" "}
        <a href="mailto:support@thecontextcache.com">support@thecontextcache.com</a>
      </p>
    </div>
  );
}

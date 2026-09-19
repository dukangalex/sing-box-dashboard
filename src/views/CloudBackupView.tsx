import { useEffect, useState } from "react";

import { navigate } from "../app/context";
import { useDesktopHost } from "../app/desktop";
import type {
  DesktopCloudBackupAccount,
  DesktopHost,
  DesktopOverlayFlags,
} from "../app/desktop";
import { showError } from "../app/errorStore";
import { useI18n } from "../app/i18n";
import { PageHeader } from "../components/PageHeader";
import { Button, Dialog, Field, SecretInput, Spinner } from "../components/ui";
import { cx } from "../lib/cx";
import styles from "./SettingsView.module.css";

const DEFAULT_OVERLAY: DesktopOverlayFlags = {
  chinaDirect: true,
  adsBlock: true,
  strictRoute: true,
  dnsProtect: true,
  disableIpv6: true,
  disableQuic: true,
  excludeCnQuic: true,
  webrtcProtect: true,
  onDemand: true,
  configNormalize: true,
  autoRedirect: false,
};

function OverlaySwitch(props: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{props.label}</span>
      <button
        type="button"
        className={props.value ? "switch on" : "switch"}
        role="switch"
        aria-checked={props.value}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.value)}
      />
    </div>
  );
}

function CloudBackupContent({ host }: { host: DesktopHost }) {
  const { t } = useI18n();
  const [account, setAccount] = useState<DesktopCloudBackupAccount>({
    url: "",
    user: "",
    password: "",
    remoteFile: "backup.zip",
  });
  const [overlay, setOverlay] = useState<DesktopOverlayFlags>(DEFAULT_OVERLAY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [probeOk, setProbeOk] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<"cloud" | "file" | null>(null);

  const reload = () => {
    host.cloudBackup
      .get()
      .then((snapshot) => {
        setAccount(snapshot.account);
        setOverlay(snapshot.overlay);
        setLoaded(true);
      })
      .catch(showError);
  };

  useEffect(() => {
    reload();
  }, [host]);

  const persistAccount = (next: DesktopCloudBackupAccount) => {
    setAccount(next);
    void host.cloudBackup.saveAccount(next).catch(showError);
  };

  const persistOverlay = (next: DesktopOverlayFlags) => {
    setOverlay(next);
    void host.cloudBackup.saveOverlay(next).catch(showError);
  };

  const run = (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    work()
      .catch(showError)
      .finally(() => setBusy(false));
  };

  if (!loaded) {
    return <Spinner />;
  }

  return (
    <div className="page">
      <PageHeader
        title={t("Cloud Backup")}
        back={{ label: t("Settings"), onClick: () => navigate("settings") }}
      />
      <div className="settings-stack">
        <p className={styles.themeEditorNote}>
          {t("Use the same WebDAV account and backup.zip on Android and Windows.")}
        </p>
        <div className={styles.settingsList}>
          <div className="settings-row">
            <Field label={t("WebDAV URL")}>
              <input
                className="input"
                value={account.url}
                placeholder="https://dav.example.com/remote.php/dav/files/me/"
                onChange={(event) => persistAccount({ ...account, url: event.target.value })}
              />
            </Field>
          </div>
          <div className="settings-row">
            <Field label={t("Username")}>
              <input
                className="input"
                value={account.user}
                autoComplete="username"
                onChange={(event) => persistAccount({ ...account, user: event.target.value })}
              />
            </Field>
          </div>
          <div className="settings-row">
            <Field label={t("Password")}>
              <SecretInput
                value={account.password}
                onChange={(value) => persistAccount({ ...account, password: value })}
              />
            </Field>
          </div>
          <div className="settings-row">
            <Field label={t("Remote file")}>
              <input
                className="input"
                value={account.remoteFile}
                onChange={(event) =>
                  persistAccount({ ...account, remoteFile: event.target.value || "backup.zip" })
                }
              />
            </Field>
          </div>
          <button
            type="button"
            className="settings-row"
            disabled={busy || account.url.trim() === ""}
            onClick={() =>
              run(async () => {
                const ok = await host.cloudBackup.probe();
                setProbeOk(ok);
                setMessage(ok ? t("WebDAV is reachable") : t("WebDAV probe failed"));
              })
            }
          >
            <span className="settings-row-label">{t("Test connection")}</span>
            {busy ? <Spinner /> : probeOk === true ? t("OK") : probeOk === false ? t("Failed") : null}
          </button>
        </div>
        <div>
          <div className="list-section-title">{t("Cloud")}</div>
          <div className={styles.settingsList}>
            <button
              type="button"
              className={cx("settings-row", styles.actionRow)}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await host.cloudBackup.upload();
                  setMessage(t("Uploaded to WebDAV"));
                })
              }
            >
              <span className="settings-row-label">{t("Backup to cloud")}</span>
            </button>
            <button
              type="button"
              className={cx("settings-row", styles.destructiveRow)}
              disabled={busy}
              onClick={() => setConfirmOverwrite("cloud")}
            >
              <span className="settings-row-label">{t("Restore from cloud (replace)")}</span>
            </button>
            <button
              type="button"
              className="settings-row"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await host.cloudBackup.download(true);
                  setMessage(
                    t("Restored {imported} profiles, skipped {skipped}").replace(
                      "{imported}",
                      String(result.imported),
                    ).replace("{skipped}", String(result.skipped)),
                  );
                })
              }
            >
              <span className="settings-row-label">{t("Restore from cloud (keep existing)")}</span>
            </button>
          </div>
        </div>
        <div>
          <div className="list-section-title">{t("Local file")}</div>
          <div className={styles.settingsList}>
            <button
              type="button"
              className="settings-row"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const saved = await host.cloudBackup.exportFile();
                  if (saved) {
                    setMessage(t("Backup file saved"));
                  }
                })
              }
            >
              <span className="settings-row-label">{t("Export backup.zip")}</span>
            </button>
            <button
              type="button"
              className={cx("settings-row", styles.destructiveRow)}
              disabled={busy}
              onClick={() => setConfirmOverwrite("file")}
            >
              <span className="settings-row-label">{t("Import backup.zip (replace)")}</span>
            </button>
            <button
              type="button"
              className="settings-row"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await host.cloudBackup.importFile(true);
                  if (result !== null) {
                    setMessage(
                      t("Restored {imported} profiles, skipped {skipped}")
                        .replace("{imported}", String(result.imported))
                        .replace("{skipped}", String(result.skipped)),
                    );
                  }
                })
              }
            >
              <span className="settings-row-label">{t("Import backup.zip (keep existing)")}</span>
            </button>
          </div>
        </div>
        <div>
          <div className="list-section-title">{t("Routing overlay")}</div>
          <p className={styles.themeEditorNote}>
            {t("These switches travel with the cloud backup. They are applied at start, not written into the subscription file.")}
          </p>
          <div className={styles.settingsList}>
            <OverlaySwitch
              label={t("China direct")}
              value={overlay.chinaDirect}
              disabled={busy}
              onChange={(value) => persistOverlay({ ...overlay, chinaDirect: value })}
            />
            <OverlaySwitch
              label={t("Block ads")}
              value={overlay.adsBlock}
              disabled={busy}
              onChange={(value) => persistOverlay({ ...overlay, adsBlock: value })}
            />
            <OverlaySwitch
              label={t("DNS leak protection")}
              value={overlay.dnsProtect}
              disabled={busy}
              onChange={(value) => persistOverlay({ ...overlay, dnsProtect: value })}
            />
            <OverlaySwitch
              label={t("Disable IPv6")}
              value={overlay.disableIpv6}
              disabled={busy}
              onChange={(value) => persistOverlay({ ...overlay, disableIpv6: value })}
            />
            <OverlaySwitch
              label={t("Disable QUIC")}
              value={overlay.disableQuic}
              disabled={busy}
              onChange={(value) => persistOverlay({ ...overlay, disableQuic: value })}
            />
            <OverlaySwitch
              label={t("WebRTC protection")}
              value={overlay.webrtcProtect}
              disabled={busy}
              onChange={(value) => persistOverlay({ ...overlay, webrtcProtect: value })}
            />
          </div>
        </div>
        {message !== null && <p className={styles.themeEditorNote}>{message}</p>}
      </div>
      {confirmOverwrite !== null && (
        <Dialog onClose={() => (busy ? undefined : setConfirmOverwrite(null))}>
          <h3>{t("Replace local profiles?")}</h3>
          <p className="dialog-message">
            {t("Overwrite restore replaces the profile list and portable overlay settings. The WebDAV password on this computer is kept.")}
          </p>
          <div className="row-actions dialog-actions">
            <Button onClick={() => setConfirmOverwrite(null)} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const source = confirmOverwrite;
                setConfirmOverwrite(null);
                run(async () => {
                  const result =
                    source === "cloud"
                      ? await host.cloudBackup.download(false)
                      : await host.cloudBackup.importFile(false);
                  if (result !== null) {
                    setMessage(
                      t("Restored {imported} profiles, skipped {skipped}")
                        .replace("{imported}", String(result.imported))
                        .replace("{skipped}", String(result.skipped)),
                    );
                  }
                });
              }}
            >
              {busy ? <Spinner /> : t("Replace")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function CloudBackupView() {
  const host = useDesktopHost();
  if (host === null) {
    return null;
  }
  return <CloudBackupContent host={host} />;
}

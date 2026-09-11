import { useEffect, useState } from "react";

import type { DesktopHost, DesktopProfile, DesktopProfileChain, DesktopProfileChainableOutbound } from "../app/desktop";
import { useProfileChains } from "../app/desktop";
import { showError } from "../app/errorStore";
import { useI18n } from "../app/i18n";
import { Icon } from "../components/Icon";
import { Button, Card, Dialog, EmptyState, Field, IconButton, Select } from "../components/ui";
import styles from "./ChainsView.module.css";

/**
 * Lists the chain (multi-hop) bindings saved for a profile, and lets the
 * user add, edit, or remove them. A chain is an ordered list of outbound
 * tags already present in the profile's own config — applied at
 * service-start time via detour chaining, never written back to the
 * profile's base config file.
 */
export function ChainsDialog(props: { host: DesktopHost; profile: DesktopProfile; onClose: () => void }) {
  const { t } = useI18n();
  const chains = useProfileChains(props.host, props.profile.id);
  const [editing, setEditing] = useState<DesktopProfileChain | "new" | null>(null);

  const remove = (chain: DesktopProfileChain) => {
    props.host.profileChains.remove(chain.id).catch(showError);
  };

  return (
    <Dialog onClose={props.onClose} className={styles.dialog}>
      <h3>{t("Chains")} — {props.profile.name}</h3>
      <p className={styles.hint}>
        {t("A chain routes a node's traffic through another node first. Pick an entry node and an exit node from this profile's own outbounds.")}
      </p>
      {chains.length === 0 ? (
        <EmptyState icon="route">{t("No chains yet")}</EmptyState>
      ) : (
        <div className={styles.list}>
          {chains.map((chain) => (
            <div key={chain.id} className={styles.chainRow}>
              <div className={styles.chainInfo}>
                <span className={styles.chainName}>{chain.name}</span>
                <span className={styles.chainHops}>
                  {chain.hops.map((hop, index) => (
                    <span key={index} className={styles.hopChip}>
                      {hop}
                      {index < chain.hops.length - 1 && <Icon name="keyboard_arrow_right" size={12} />}
                    </span>
                  ))}
                </span>
              </div>
              <div className="row-actions">
                <IconButton title={t("Edit")} onClick={() => setEditing(chain)}>
                  <Icon name="edit" size={16} />
                </IconButton>
                <IconButton title={t("Delete")} danger onClick={() => remove(chain)}>
                  <Icon name="delete" size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row-actions dialog-actions">
        <Button onClick={props.onClose}>{t("Close")}</Button>
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("Add Chain")}
        </Button>
      </div>
      {editing !== null && (
        <ChainEditorDialog
          host={props.host}
          profile={props.profile}
          chain={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Dialog>
  );
}

function ChainEditorDialog(props: {
  host: DesktopHost;
  profile: DesktopProfile;
  chain?: DesktopProfileChain;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [outbounds, setOutbounds] = useState<DesktopProfileChainableOutbound[] | null>(null);
  const [name, setName] = useState(props.chain?.name ?? "");
  const [hops, setHops] = useState<string[]>(props.chain?.hops ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    props.host.profileChains
      .listChainableOutbounds(props.profile.id)
      .then((value) => {
        if (!stale) {
          setOutbounds(value);
        }
      })
      .catch(showError);
    return () => {
      stale = true;
    };
  }, [props.host, props.profile.id]);

  const availableForNewHop = (outbounds ?? []).filter((outbound) => !hops.includes(outbound.tag));

  const addHop = (tag: string) => {
    setHops((current) => [...current, tag]);
  };

  const removeHop = (index: number) => {
    setHops((current) => current.filter((_, i) => i !== index));
  };

  const moveHop = (index: number, direction: -1 | 1) => {
    setHops((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const valid = name.trim() !== "" && hops.length >= 2;

  const save = () => {
    setBusy(true);
    const request =
      props.chain === undefined
        ? props.host.profileChains.create({ profileId: props.profile.id, name: name.trim(), hops })
        : props.host.profileChains.update(props.chain.id, { name: name.trim(), hops });
    request.then(props.onClose).catch(showError).finally(() => setBusy(false));
  };

  return (
    <Dialog onClose={props.onClose}>
      <h3>{props.chain === undefined ? t("Add Chain") : t("Edit Chain")}</h3>
      <Field label={t("Name")}>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label={t("Hops")}>
        <div className={styles.hopsEditor}>
          {hops.length === 0 && <p className={styles.hint}>{t("Add at least two nodes, in order from entry to exit.")}</p>}
          {hops.map((hop, index) => (
            <div key={`${hop}-${index}`} className={styles.hopRow}>
              <span className={styles.hopIndex}>{index + 1}</span>
              <span className={styles.hopTag}>{hop}</span>
              <div className="row-actions">
                <IconButton
                  title={t("Move Up")}
                  disabled={index === 0}
                  onClick={() => moveHop(index, -1)}
                >
                  <Icon name="expand_less" size={14} />
                </IconButton>
                <IconButton
                  title={t("Move Down")}
                  disabled={index === hops.length - 1}
                  onClick={() => moveHop(index, 1)}
                >
                  <Icon name="expand_more" size={14} />
                </IconButton>
                <IconButton title={t("Remove")} danger onClick={() => removeHop(index)}>
                  <Icon name="close" size={14} />
                </IconButton>
              </div>
            </div>
          ))}
          {availableForNewHop.length > 0 && (
            <Select<string>
              placeholder={t("Add a node...")}
              options={availableForNewHop.map((outbound) => ({
                value: outbound.tag,
                label: `${outbound.tag} (${outbound.type})`,
              }))}
              value=""
              onChange={addHop}
            />
          )}
        </div>
      </Field>
      <div className="row-actions dialog-actions">
        <Button onClick={props.onClose}>{t("Cancel")}</Button>
        <Button variant="primary" disabled={!valid || busy} onClick={save}>
          {props.chain === undefined ? t("Create") : t("Save")}
        </Button>
      </div>
    </Dialog>
  );
}

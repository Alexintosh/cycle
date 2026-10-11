import { Button } from "./ui/button"

export function RecoveryCodeList({ codes }: { codes: string[] }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob(["Cycle recovery codes\nKeep these private. Each code can replace your passkeys and access your account.\n\n" + codes.join("\n") + "\n"], { type: "text/plain" }))
    const link = document.createElement("a")
    link.href = url; link.download = "cycle-recovery-codes.txt"; link.click()
    URL.revokeObjectURL(url)
  }
  return <div className="space-y-3">
    <p className="text-sm text-slate-600 dark:text-slate-300">Save these codes in a safe place. Each code can restore access if you lose your passkey. They are shown only once. Recovery replaces your previous passkeys and codes.</p>
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 font-mono text-xs space-y-2">{codes.map(code => <p key={code}>{code}</p>)}</div>
    <Button type="button" variant="outline" onClick={download}>Download recovery codes</Button>
  </div>
}

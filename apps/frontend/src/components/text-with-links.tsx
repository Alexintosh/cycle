import { Fragment } from "react"

export function TextWithLinks({ text }: { text: string }) {
  let linkNumber = 0

  return text.split(/(https?:\/\/[^\s<>]+)/gi).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) {
      return part
    }

    const href = part.replace(/[.,;:!?]+$/, "").replace(/\)+$/, (closing) => {
      const openingCount = (part.match(/\(/g) ?? []).length
      const closingCount = (part.match(/\)/g) ?? []).length
      return closing.slice(0, Math.max(0, closing.length - Math.max(0, closingCount - openingCount)))
    })
    linkNumber += 1

    return (
      <Fragment key={index}>
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-700 dark:text-sky-400 underline underline-offset-2">
          link-{linkNumber}
        </a>
        {part.slice(href.length)}
      </Fragment>
    )
  })
}

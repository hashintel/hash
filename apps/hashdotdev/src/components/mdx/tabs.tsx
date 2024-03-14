import type { FunctionComponent, PropsWithChildren } from "react";
import { useState } from "react";

export const Tabs: FunctionComponent<PropsWithChildren> = ({ children }) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="docs-tabs">
      <div className="tabs-headers">
        {children && Array.isArray(children) ? (
          children.map((child, index) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              className={`tabs-header${index === activeTab ? ` active` : ``}`}
              onClick={() => {
                setActiveTab(index);
              }}
              style={{
                borderTopLeftRadius: index === 0 ? 3 : undefined,
                borderTopRightRadius:
                  index === children.length - 1 ? 3 : undefined,
              }}
              // eslint-disable-next-line react/no-array-index-key
              key={index}
            >
              {(child as { props: { title: string } }).props.title}
            </div>
          ))
        ) : (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            className={`tabs-header${activeTab === 0 ? ` active` : ``}`}
            onClick={() => {
              setActiveTab(0);
            }}
            style={{
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
            }}
            key={0}
          >
            {(children as unknown as { props: { title: string } }).props.title}
          </div>
        )}
      </div>
      {children && Array.isArray(children) && children[activeTab]
        ? children[activeTab]
        : children}
    </div>
  );
};

export const TextTabs = ({
  children,
}: {
  children: React.ReactNode[] | undefined;
}) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="docs-text-tabs">
      <div className="tabs-headers">
        {children?.map ? (
          children.map((child, index) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              className={`tabs-header${index === activeTab ? ` active` : ``}`}
              onClick={() => {
                setActiveTab(index);
              }}
              style={{
                borderTopLeftRadius: index === 0 ? 3 : undefined,
                borderTopRightRadius:
                  index === children.length - 1 ? 3 : undefined,
              }}
              // eslint-disable-next-line react/no-array-index-key
              key={index}
            >
              {(child as { props: { title: string } }).props.title}
            </div>
          ))
        ) : (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            className={`tabs-header${activeTab === 0 ? ` active` : ``}`}
            onClick={() => {
              setActiveTab(0);
            }}
            style={{
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
            }}
            key={0}
          >
            {(children as unknown as { props: { title: string } }).props.title}
          </div>
        )}
      </div>
      {children?.[activeTab] ? children[activeTab] : children}
    </div>
  );
};

export const TextTab = ({
  children,
}: {
  children: React.ReactNode | undefined;
}) => {
  return <div className="markdown-wrapper text-tab">{children}</div>;
};

export const Tab = ({
  children,
}: {
  children: React.ReactNode | undefined;
}) => {
  return <div className="markdown-wrapper">{children}</div>;
};

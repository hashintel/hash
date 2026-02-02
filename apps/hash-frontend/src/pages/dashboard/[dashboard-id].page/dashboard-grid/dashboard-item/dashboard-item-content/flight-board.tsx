/**
 * Flight Board Component
 *
 * A classic airport flight board with dot matrix / flip-board aesthetic.
 * Can display either arrivals or departures based on the mode prop.
 */
import type { EntityId } from "@blockprotocol/type-system";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";

export type FlightBoardFlight = {
  entityId?: EntityId;
  flight: string;
  /** For arrivals: origin airport. For departures: destination airport. */
  origin?: string;
  destination?: string;
  scheduledTime: string;
  estimatedTime?: string;
  gate?: string;
  status:
    | "On Time"
    | "Landing"
    | "Boarding"
    | "Delayed"
    | "Landed"
    | "Departed"
    | "Cancelled";
};

type FlightBoardMode = "arrivals" | "departures";

type FlightBoardProps = {
  flights: FlightBoardFlight[];
  mode?: FlightBoardMode;
  onFlightClick?: (entityId: EntityId) => void;
};

const statusColors: Record<FlightBoardFlight["status"], string> = {
  "On Time": "#4ADE80",
  Landing: "#FBBF24",
  Boarding: "#FBBF24",
  Delayed: "#F87171",
  Landed: "#9CA3AF",
  Departed: "#9CA3AF",
  Cancelled: "#EF4444",
};

const DotMatrixText: FunctionComponent<{
  children: string;
  color?: string;
  align?: "left" | "center" | "right";
  fontSize?: number;
}> = ({ children, color = "#FFD700", align = "left", fontSize = 14 }) => (
  <Typography
    sx={{
      fontFamily: '"Share Tech Mono", "Courier New", monospace',
      fontSize,
      fontWeight: 600,
      color,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      textAlign: align,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </Typography>
);

const BoardRow: FunctionComponent<{
  flight: FlightBoardFlight;
  mode: FlightBoardMode;
  onClick?: () => void;
}> = ({ flight, mode, onClick }) => {
  const statusColor = statusColors[flight.status];
  const textColor = "#FFD700";
  const location =
    mode === "arrivals" ? flight.origin : (flight.destination ?? "");
  const isClickable = !!onClick;

  return (
    <Box
      onClick={onClick}
      sx={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 70px 70px 60px 100px",
        gap: 1.5,
        py: 1,
        px: 2,
        borderBottom: "1px solid #2a2a2a",
        backgroundColor: "transparent",
        cursor: isClickable ? "pointer" : "default",
        "&:hover": {
          backgroundColor: isClickable ? "#252525" : "#1a1a1a",
        },
      }}
    >
      <DotMatrixText fontSize={14}>{flight.flight}</DotMatrixText>
      <DotMatrixText fontSize={14}>{location ?? "-"}</DotMatrixText>
      <DotMatrixText fontSize={14} align="center">
        {flight.scheduledTime}
      </DotMatrixText>
      <DotMatrixText
        fontSize={14}
        align="center"
        color={
          flight.estimatedTime !== flight.scheduledTime ? "#F87171" : textColor
        }
      >
        {flight.estimatedTime ?? "-"}
      </DotMatrixText>
      <DotMatrixText fontSize={14} align="center">
        {flight.gate ?? "-"}
      </DotMatrixText>
      <DotMatrixText fontSize={14} color={statusColor}>
        {flight.status}
      </DotMatrixText>
    </Box>
  );
};

export const FlightBoard: FunctionComponent<FlightBoardProps> = ({
  flights,
  mode = "arrivals",
  onFlightClick,
}) => {
  const locationLabel = mode === "arrivals" ? "ORIGIN" : "DESTINATION";
  const boardLabel = mode === "arrivals" ? "ARRIVALS" : "DEPARTURES";
  const emptyMessage = mode === "arrivals" ? "NO ARRIVALS" : "NO DEPARTURES";

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        backgroundColor: "#0a0a0a",
        borderRadius: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "80px 1fr 70px 70px 60px 100px",
          gap: 1.5,
          py: 1,
          px: 2,
          borderBottom: "2px solid #333",
          backgroundColor: "#1a1a1a",
        }}
      >
        <DotMatrixText fontSize={11} color="#888">
          FLIGHT
        </DotMatrixText>
        <DotMatrixText fontSize={11} color="#888">
          {locationLabel}
        </DotMatrixText>
        <DotMatrixText fontSize={11} color="#888" align="center">
          SCHED
        </DotMatrixText>
        <DotMatrixText fontSize={11} color="#888" align="center">
          EST
        </DotMatrixText>
        <DotMatrixText fontSize={11} color="#888" align="center">
          GATE
        </DotMatrixText>
        <DotMatrixText fontSize={11} color="#888">
          STATUS
        </DotMatrixText>
      </Box>

      {/* Flight rows */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          "&::-webkit-scrollbar": {
            width: 6,
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "#1a1a1a",
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#333",
            borderRadius: 3,
          },
        }}
      >
        {flights.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              py: 4,
            }}
          >
            <DotMatrixText color="#666">{emptyMessage}</DotMatrixText>
          </Box>
        ) : (
          flights.map((flight, index) => (
            <BoardRow
              key={`${flight.flight}-${index}`}
              flight={flight}
              mode={mode}
              onClick={
                flight.entityId && onFlightClick
                  ? () => onFlightClick(flight.entityId!)
                  : undefined
              }
            />
          ))
        )}
      </Box>

      {/* Footer with time */}
      <Box
        sx={{
          py: 0.75,
          px: 2,
          borderTop: "1px solid #2a2a2a",
          backgroundColor: "#151515",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <DotMatrixText fontSize={10} color="#555">
          {boardLabel}
        </DotMatrixText>
        <DotMatrixText fontSize={10} color="#555">
          {new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          UTC
        </DotMatrixText>
      </Box>
    </Box>
  );
};

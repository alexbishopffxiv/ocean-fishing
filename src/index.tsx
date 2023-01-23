import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import { fishData, Route, Fish } from "./data/fish";
import { routeData } from "./data/route";
import { differenceInHours } from "date-fns";
import { baitData } from "./data/bait";
import classNames from "classnames";

// START: Define window functions set by FFXIV ACT Plugin
// Full API: https://ngld.github.io/OverlayPlugin/devs/event_types.html
type ChangeZoneCallback = ({ zoneID }: { zoneID: number }) => void;
type LogLineCallback = ({ rawLine }: { rawLine: string }) => void;

interface EventHandlers {
  ChangeZone: ChangeZoneCallback;
  LogLine: LogLineCallback;
}

type EventNames = keyof EventHandlers;
type OverlayEventListener = <K extends EventNames>(
  event: K,
  callback: EventHandlers[K]
) => void;

declare global {
  interface Window {
    addOverlayListener: OverlayEventListener;
    removeOverlayListener: OverlayEventListener;
    startOverlayEvents: () => void;
  }
}
// END: FFXIV ACT Plugin definitions

const regex = {
  changeFishingArea:
    /^00\|[^|]*\|[^|]*\|Foerzagyl\|Weigh the anchors! Shove off!\|/,
  cast: /^00\|[^|]*\|[^|]*\|\|You cast your line/,
  miss: /^00\|[^|]*\|[^|]*\|\|(Nothing bites\.|You reel in your line|You lose your bait|The fish gets away|You lose your |You cannot carry any more)/,
  mooch:
    /^00\|[^|]*\|[^|]*\|\|You recast your line with the fish still hooked\./,
  quit: /^00\|[^|]*\|[^|]*\|\|(You put away your rod|Fishing canceled)/,
  bite: /^00\|[^|]*\|[^|]*\|\|Something bites/,
};

interface RouteInfo {
  name: string;
  bait: string;
  spectralBait: string;
  targets: Fish[];
}

interface Props {}

interface State {
  castTime: number;
  routeInfo: RouteInfo[];
  routeIndex: number;
}

class App extends React.Component<Props, State> {
  isCastInProgress: boolean;
  castStartTime: number;
  isMooch: boolean;
  isDebug: boolean;
  isSpectral: boolean;
  isOceanFishing: boolean;

  constructor(props: Props) {
    super(props);
    this.isCastInProgress = false;
    this.castStartTime = 0;
    this.isMooch = false;
    this.isSpectral = false;
    this.isOceanFishing = false;
    this.isDebug =
      new URLSearchParams(window.location.search).get("debug") !== null;

    this.state = {
      castTime: 0,
      routeInfo: this.getCurrentRouteInfo(),
      routeIndex: 0,
    };
  }

  getInitialState() {
    const state = {
      castTime: 0,
      routeInfo: this.getCurrentRouteInfo(),
      routeIndex: 0,
    };
    return state;
  }

  componentDidMount() {
    this.registerListeners();
  }

  getRoute() {
    const anchorDate = new Date("November 25, 2021 00:00:00");
    const anchorOffset = 44;

    let interval = differenceInHours(new Date(), anchorDate);
    // Adjustment to show the upcoming route one hour
    // before it starts.
    if (interval % 2 === 1) {
      interval++;
    }

    const routeIndex =
      (Math.floor(interval / 2) + anchorOffset) % routeData.length;
    return routeData[routeIndex];
  }

  getFishData(route: Route, timeOfDay: "day" | "night" | "sunset") {
    const fish = fishData[route];
    const baits = baitData[route];

    let bait = baits.default;
    let spectralBait = baits[timeOfDay];

    let targetFish = [];
    for (const f of fish) {
      if (f.isRecommended && (f.timeOfDay === timeOfDay || !f.timeOfDay)) {
        if (f.isMooch || !(f.isBaitRequired && f.bait !== spectralBait)) {
          targetFish.push(f);
        }
      }
    }

    return {
      targets: targetFish.sort((a, b) => a.minTime - b.minTime),
      name: `${route} (${timeOfDay[0].toUpperCase() + timeOfDay.slice(1)})`,
      bait,
      spectralBait,
    };
  }

  getCurrentRouteInfo() {
    const route = this.getRoute();
    const result = [];
    for (const [name, timeOfDay] of route) {
      result.push(this.getFishData(name, timeOfDay));
    }
    return result;
  }

  parseLogLine = ({ rawLine }: { rawLine: string }) => {
    if (!this.isOceanFishing) {
      return;
    }

    for (let event in regex) {
      if (regex[event as keyof typeof regex].exec(rawLine)) {
        switch (event) {
          case "changeFishingArea":
            this.setState({ routeIndex: this.state.routeIndex + 1 });
            break;
          case "cast":
            this.isSpectral = rawLine.indexOf("spectral current") !== -1;
            this.isMooch = false;
            this.startCast();
            break;
          case "mooch":
            this.isMooch = true;
            this.startCast();
            break;
          case "miss":
          case "quit":
          case "bite":
            this.stopCast();
            break;
        }
      }
    }
  };

  registerListeners() {
    window.addOverlayListener("LogLine", this.parseLogLine);
    window.addOverlayListener("ChangeZone", ({ zoneID }) => {
      if (!this.isOceanFishing && zoneID === 900) {
        this.isOceanFishing = true;
        this.setState(this.getInitialState());
      } else if (zoneID !== 900) {
        this.isOceanFishing = false;
      }
      this.toggleWindow(this.isOceanFishing);
    });

    window.startOverlayEvents();
  }

  toggleWindow(isVisible: boolean) {
    if (isVisible) {
      document.body.classList.remove("isHidden");
    } else {
      document.body.classList.add("isHidden");
    }
  }

  startCast = () => {
    this.isCastInProgress = true;
    this.castStartTime = Date.now();
    this.setState({
      castTime: 0,
    });
    this.cast();
  };

  stopCast = () => {
    this.isCastInProgress = false;
  };

  cast = () => {
    if (!this.isCastInProgress || !this.isOceanFishing) {
      return;
    }

    this.setState({
      castTime: Number(((Date.now() - this.castStartTime) / 1000).toFixed(1)),
    });

    requestAnimationFrame(this.cast);
  };

  renderDebug() {
    this.toggleWindow(true);
    const routes = Object.keys(fishData) as (keyof typeof fishData)[];
    const result = [];
    for (const route of routes) {
      result.push(this.getFishData(route, "day"));
      result.push(this.getFishData(route, "sunset"));
      result.push(this.getFishData(route, "night"));
    }

    return (
      <div>
        {this.state.castTime}
        <button onClick={this.startCast}>Cast</button>
        {result.map((r) => (
          <div key={r.name}>
            <h1>{r.name}</h1>
            {this.renderFishGrid(r)}
          </div>
        ))}
      </div>
    );
  }

  isSelected(fish: Fish) {
    if (!this.isSpectral) {
      return false;
    }

    const lowerBound = fish.minTime - 0.07;
    const upperBound = fish.maxTime - 0.07;
    const currentTime = this.state.castTime;
    return currentTime >= lowerBound && currentTime <= upperBound;
  }

  renderFishGrid(fish: RouteInfo) {
    return (
      <div>
        {fish.targets.map((f) => (
          <div
            key={f.name}
            className={classNames({
              fishRow: true,
              isSelected: this.isSelected(f),
            })}
          >
            <div className="fishTug">{["!", "!!", "!!!"][f.tug - 1]}</div>
            <div className="fishTime">
              {(() => {
                if (f.minTime === f.maxTime) {
                  return f.minTime;
                }
                return `${f.minTime}-${f.maxTime}`;
              })()}
            </div>
            <div className="fishPoints">
              {((f.maxDh - 1) * 2 + 1) * f.points * 2}
            </div>
            <div className="fishName">
              {f.name}
              {f.isMooch ? "*" : ""}
            </div>
          </div>
        ))}
      </div>
    );
  }

  calculatePoints(maxDh: number, points: number) {
    const thPoints = (maxDh - 1) * 2 * points * 2;
  }

  formatCastTime(time: number) {
    if (Math.floor(time) === time) {
      return String(time) + ".0";
    }
    return String(time);
  }

  render() {
    if (this.isDebug) {
      return this.renderDebug();
    }

    const routeInfo = this.state.routeInfo[this.state.routeIndex];
    return (
      <div className="App">
        <div className="top">
          <div className="castTime">
            {this.formatCastTime(this.state.castTime)}
          </div>
          <div>{this.renderFishGrid(routeInfo)}</div>
        </div>
        <div className="bottom">
          <div className="routeName">{routeInfo.name}</div>
          <div>
            {routeInfo.bait} → {routeInfo.spectralBait}
          </div>
        </div>
      </div>
    );
  }
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);

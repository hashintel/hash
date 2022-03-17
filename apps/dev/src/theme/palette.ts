/**
 * @todo update from blockprotocol
 */
import { ThemeOptions } from "@mui/material";

/**
--mono---black: #0E1114;
--mono---white: #FFFFFF;
--mono---gray-10: #F7FAFC;
--mono---gray-20: #EBF2F7;
--mono---gray-30: #DDE7F0;
--mono---gray-40: #C1CFDE;
--mono---gray-50: #91A5BA;
--mono---gray-60: #758AA1;
--mono---gray-70: #64778C;
--mono---gray-80: #4D5C6C;
--mono---gray-90: #37434F;
--blue---blue-10: #F7FDFF;
--blue---blue-15: #EBF8FF;
--blue---blue-20: #E0F4FF;
--blue---blue-25: #CCEDFF;
--blue---blue-30: #B4E2FD;
--blue---blue-40: #7ACAFA;
--blue---blue-50: #48B3F4;
--blue---blue-60: #199BEF;
--blue---blue-70: #0775E3;
--blue---blue-80: #006DC3;
--blue---blue-90: #0059A5;
--blue---blue-100: #03366C;
--purple---purple-10: #F7F8FF;
--purple---purple-20: #EFEBFE;
--purple---purple-30: #E4DDFD;
--purple---purple-40: #C6B7FA;
--purple---purple-50: #A690F4;
--purple---purple-60: #8D68F8;
--purple---purple-70: #7556DC;
--purple---purple-80: #5532C3;
--purple---purple-90: #4625AA;
--purple---purple-100: #3A2084;
--red---red-10: #FFF5F7;
--red---red-20: #FFE2E2;
--red---red-30: #FFC1C2;
--red---red-40: #FF9EA7;
--red---red-50: #F37174;
--red---red-60: #EB5056;
--red---red-70: #DF3449;
--red---red-80: #CC1B3B;
--red---red-90: #B20D2B;
--red---red-100: #8D131B;
--green---green-10: #FAFDF0;
--green---green-20: #F8FDD5;
--green---green-30: #EEF8AB;
--green---green-40: #DCEF87;
--green---green-50: #BDE170;
--green---green-60: #9AC952;
--green---green-70: #70A140;
--green---green-80: #49781E;
--green---green-90: #334D0B;
--green---green-100: #243804;
--yellow---yellow-10: #FFFEF7;
--yellow---yellow-20: #FFFAE5;
--yellow---yellow-30: #FEF8D7;
--yellow---yellow-40: #FDEEAF;
--yellow---yellow-50: #FCE288;
--yellow---yellow-60: #F8D462;
--yellow---yellow-70: #F2BB36;
--yellow---yellow-80: #E9A621;
--yellow---yellow-90: #9E6306;
--yellow---yellow-100: #754602;
--teal---teal-10: #F2FCFD;
--teal---teal-20: #E7F9FB;
--teal---teal-30: #D8F3F6;
--teal---teal-40: #AADEE6;
--teal---teal-50: #84CDDA;
--teal---teal-60: #3DB9CF;
--teal---teal-70: #05A2C2;
--teal---teal-80: #0894B3;
--teal---teal-90: #0C7792;
--teal---teal-100: #04313C;
--pink---pink-10: #FFFAFC;
--pink---pink-20: #FEEDF3;
--pink---pink-30: #FED1E3;
--pink---pink-40: #FDB1D1;
--pink---pink-50: #FB91C1;
--pink---pink-60: #F15FA4;
--pink---pink-70: #E84694;
--pink---pink-80: #DA3285;
--pink---pink-90: #A81761;
--pink---pink-100: #850F4C;
--mint---mint-10: #EFFEFA;
--mint---mint-20: #E1FBF4;
--mint---mint-30: #D2F7ED;
--mint---mint-40: #C0EFE3;
--mint---mint-50: #A5E4D4;
--mint---mint-60: #7DD4C0;
--mint---mint-70: #40C4AA;
--mint---mint-80: #1AAE9A;
--mint---mint-90: #147D6F;
--mint---mint-100: #0D5349;
--copper---copper-10: #FCF9F6;
--copper---copper-20: #F8F1EA;
--copper---copper-30: #EFDDCC;
--copper---copper-40: #E8CDB5;
--copper---copper-50: #DDB896;
--copper---copper-60: #D09E72;
--copper---copper-70: #AD7F58;
--copper---copper-80: #A07653;
--copper---copper-90: #886349;
--copper---copper-100: #3F2C22;
--navy---navy-10: #F5FAFF;
--navy---navy-20: #D8E4F5;
--navy---navy-30: #BCCFEB;
--navy---navy-40: #8BA5D6;
--navy---navy-50: #6480C2;
--navy---navy-60: #4660AD;
--navy---navy-70: #304799;
--navy---navy-80: #203485;
--navy---navy-90: #162670;
--navy---navy-100: #0E1B5C;

*/

export const customColors = {
  yellow: {
    100: "#FFF8F0",
    200: "#FFF3E5",
    300: "#FFEAC2",
    400: "#FFE0BF",
    500: "#FFC180",
    600: "#F8D462",
    700: "#FBA759",
    800: "#E36C29",
    900: "#BB4317",
  },
  orange: {
    100: "#FFFAF5",
    200: "#FEECDC",
    300: "#FFDEBA",
    400: "#FFC180",
    500: "#FB9B56",
    600: "#E77632",
    700: "#CF5B23",
    800: "#BB4317",
    900: "#8C1E0A",
  },
  purple: {
    600: "#7A4FF5",
  },
  // should adjust to be consistent with the ones above
  gray: {
    10: "#F7FAFC",
    20: "#EBF2F7",
    30: "#DDE7F0",
    40: "#C1CFDE",
    50: "#91A5BA",
    60: "#758AA1",
    70: "#64778C",
    80: "#4D5C6C",
    90: "#37434F",
  },
  grey: undefined,
  black: "#0E1114",
  white: "#FFFFFF",
} as const;

export const palette: ThemeOptions["palette"] = {
  ...customColors,
  primary: {
    main: customColors.yellow[300],
  },
  secondary: {
    main: customColors.purple[600],
  },
};

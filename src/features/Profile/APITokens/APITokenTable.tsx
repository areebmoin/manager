import * as moment from 'moment';
import { compose, path } from 'ramda';
import * as React from 'react';

import Paper from '@material-ui/core/Paper';
import { StyleRulesCallback, WithStyles, withStyles } from '@material-ui/core/styles';
import TableBody from '@material-ui/core/TableBody';
import TableHead from '@material-ui/core/TableHead';
import Typography from '@material-ui/core/Typography';

import ActionsPanel from 'src/components/ActionsPanel';
import AddNewLink from 'src/components/AddNewLink';
import Button from 'src/components/Button';
import ConfirmationDialog from 'src/components/ConfirmationDialog';
import Grid from 'src/components/Grid';
import Notice from 'src/components/Notice';
import Pagey, { PaginationProps } from 'src/components/Pagey';
import PaginationFooter from 'src/components/PaginationFooter';
import Table from 'src/components/Table';
import TableCell from 'src/components/TableCell';
import TableRow from 'src/components/TableRow';
import TableRowEmptyState from 'src/components/TableRowEmptyState';
import TableRowError from 'src/components/TableRowError';
import TableRowLoading from 'src/components/TableRowLoading';
import { createPersonalAccessToken, deleteAppToken, deletePersonalAccessToken, getAppTokens, getPersonalAccessTokens, updatePersonalAccessToken } from 'src/services/profile';
import isPast from 'src/utilities/isPast';
import scrollErrorIntoView from 'src/utilities/scrollErrorIntoView';

import APITokenDrawer, { DrawerMode, genExpiryTups } from './APITokenDrawer';
import APITokenMenu from './APITokenMenu';

type ClassNames = 'headline'
  | 'paper'
  | 'labelCell'
  | 'typeCell'
  | 'createdCell';

const styles: StyleRulesCallback<ClassNames> = (theme) => {
  return ({
    headline: {
      marginTop: theme.spacing.unit * 2,
      marginBottom: theme.spacing.unit * 2,
    },
    paper: {
      marginBottom: theme.spacing.unit * 2,
    },
    labelCell: {
      width: '30%',
    },
    typeCell: {
      width: '20%',
    },
    createdCell: {
      width: '20%',
    },
  });
};

export type APITokenType = 'OAuth Client Token' | 'Personal Access Token';
export type APITokenTitle = 'Apps' | 'Personal Access Tokens';

interface Props extends PaginationProps<Linode.Token> {
  type: APITokenType;
  title: APITokenTitle;
}

interface FormState {
  mode: DrawerMode;
  open: boolean;
  errors?: Linode.ApiFieldError[];
  id?: number;
  values: {
    scopes?: string;
    expiry?: string;
    label: string;
  };
}

interface DialogState {
  open: boolean;
  id?: number;
  label?: string;
  errors?: Linode.ApiFieldError[];
  type: string;
}

interface TokenState {
  open: boolean;
  value?: string;
}

interface State {
  form: FormState;
  dialog: DialogState;
  token?: TokenState;
}

type CombinedProps = Props & WithStyles<ClassNames>;

export class APITokenTable extends React.Component<CombinedProps, State> {
  static defaultState: State = {
    form: {
      mode: 'view' as DrawerMode,
      open: false,
      errors: undefined,
      id: undefined,
      values: {
        scopes: undefined,
        expiry: genExpiryTups()[0][1],
        label: '',
      },
    },
    dialog: {
      open: false,
      id: 0,
      label: undefined,
      errors: undefined,
      type: '',
    },
    token: {
      open: false,
      value: undefined,
    },
  };

  mounted: boolean = false;

  state = {
    ...APITokenTable.defaultState,
  };

  openCreateDrawer = () => {
    this.setState({
      form: {
        ...APITokenTable.defaultState.form,
        mode: 'create',
        open: true,

      },
    });
  }

  openViewDrawer = (token: Linode.Token) => {
    this.setState({
      form: {
        ...APITokenTable.defaultState.form,
        mode: 'view',
        open: true,
        id: token.id,
        values: {
          scopes: token.scopes,
          expiry: token.expiry,
          label: token.label,
        },
      },
    });
  }

  openEditDrawer = (token: Linode.Token) => {
    this.setState({
      form: {
        ...APITokenTable.defaultState.form,
        mode: 'edit',
        open: true,
        id: token.id,
        values: {
          scopes: token.scopes,
          expiry: token.expiry,
          label: token.label,
        },
      },
    });
  }

  closeDrawer = () => {
    const { form } = this.state;
    /* Only set { open: false } to avoid flicker of drawer appearance while closing */
    this.setState({
      form: {
        ...form,
        open: false,
      },
    });
  }

  openRevokeDialog = (token:Linode.Token, type:string) => {
    const { label, id } = token;
    this.setState({ dialog: { ...this.state.dialog, open: true, label, id, type, errors: undefined } });
  }

  closeRevokeDialog = () => {
    this.setState({ dialog: { ...this.state.dialog, id: undefined, open: false } });
  }

  openTokenDialog = (token: string) => {
    this.setState({
      dialog: {
        ...this.state.dialog,
        errors: undefined
      },
      form: {
        ...this.state.form,
        errors: undefined
      },
      token: {
        open: true,
        value: token }
    });
  }

  closeTokenDialog = () => {
    this.setState({ token: { open: false, value: undefined } });
  }

  revokePersonalAccessToken = () => {
    const { dialog } = this.state;
    deletePersonalAccessToken(dialog.id as number)
      .then(() => this.props.request())
      .then(() => this.closeRevokeDialog())
      .catch((err: any) => this.showDialogError(err))
  }

  revokeAppToken = () => {
    const { dialog } = this.state;
    deleteAppToken(dialog.id as number)
    .then(() => this.props.request())
    .then(() => { this.closeRevokeDialog(); })
    .catch((err: any) => this.showDialogError(err))
  }

  showDialogError(err: any) {
    const apiError = path<Linode.ApiFieldError[]>(['response', 'data', 'error'], err);

    return this.setState({
      dialog: {
        ...this.state.dialog,
        open: true,
        submitting: false,
        errors: apiError
        ? apiError
        : [{ field: 'none', reason: 'Unable to complete your request at this time.' }],
      }
    });
  }

  handleDrawerChange = (key: string, value: string) => {
    const { form } = this.state;
    this.setState({
      form:
        { ...form, values: { ...form.values, [key]: value } },
    });
  }

  createToken = (scopes: string) => {
    if (scopes === '') {
      this.setState({
        form: {
          ...this.state.form,
          errors: [
            { reason: 'You must select some permissions', field: 'scopes' },
          ],
        },
      }, () => {
        scrollErrorIntoView();
      });
      return;
    }
    if (!this.state.form.values.label) { // if no label
      this.setState({
        form: {
          ...this.state.form,
          errors: [
            { reason: 'You must give your token a label.', field: 'label' },
          ],
        },
      }, () => {
        scrollErrorIntoView();
      });
      return;
    }

    const { form } = this.state;
    this.setState({ form: { ...form, values: { ...form.values, scopes } } }, () => {
      createPersonalAccessToken(this.state.form.values)
        .then(({ token }) => {
          if (!token) {
            return this.setState({
              form: {
                ...form,
                errors: [{ field: 'none', reason: 'API did not return a token.' }],
              },
            }, () => {
              scrollErrorIntoView();
            });
          }
          this.closeDrawer();
          this.openTokenDialog(token);
        })
        .then(() => this.props.request())
        .catch((errResponse) => {
          if (!this.mounted) { return; }

          this.setState({
            form: {
              ...form,
              errors: path(['response', 'data', 'errors'], errResponse),
            },
          }, () => {
            scrollErrorIntoView();
          });
        });
    });
    return;
  }

  editToken = () => {
    const { form: { id, values: { label } } } = this.state;
    if (!id) { return; }

    if (!label) {
      this.setState({
        form: {
          ...this.state.form,
          errors: [
            { reason: 'You must give your token a label.', field: 'label' },
          ],
        },
      }, () => {
        scrollErrorIntoView();
      });
      return;
    }

    updatePersonalAccessToken(id, { label })
      .then(() => { this.closeDrawer(); })
      .then(() => this.props.request())
      .catch((errResponse) => {
        if (!this.mounted) { return; }

        this.setState({
          form: {
            ...this.state.form,
            errors: path(['response', 'data', 'errors'], errResponse),
          },
        }, () => {
          scrollErrorIntoView();
        });
      });
    return;
  }

  componentDidMount() {
    this.mounted = true;
    this.props.handleOrderChange('created');
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  renderContent() {
    const { error, loading, data } = this.props;

    if (loading) {
      return <TableRowLoading colSpan={6} />;
    }

    if (error) {
      return <TableRowError colSpan={6} message="We were unable to load your API Tokens." />;
    }

    return data && data.length > 0 ? this.renderRows() : <TableRowEmptyState colSpan={6} />
  }

  renderRows() {
    const { title, type, data: tokens = [] } = this.props;

    return tokens.map((token: Linode.Token) =>
      <TableRow key={token.id} data-qa-table-row={token.label}>
        <TableCell parentColumn="Label">
          <Typography role="header" variant="subheading" data-qa-token-label>
            {token.label}
          </Typography>
        </TableCell>
        <TableCell parentColumn="Type">
          <Typography variant="body1" data-qa-token-type>
            {type}
          </Typography>
        </TableCell>
        <TableCell parentColumn="Created">
          <Typography variant="body1" data-qa-token-created>
            {token.created}
          </Typography>
        </TableCell>
        <TableCell parentColumn="Expires">
          <Typography variant="body1" data-qa-token-expiry>
            {token.expiry}
          </Typography>
        </TableCell>
        <TableCell>
          <APITokenMenu
            token={token}
            type={type}
            isAppTokenMenu={(title === 'Apps')}
            openViewDrawer={this.openViewDrawer}
            openEditDrawer={this.openEditDrawer}
            openRevokeDialog={this.openRevokeDialog}
          />
        </TableCell>
      </TableRow>
    );
  }

  render() {
    const { classes, type, title } = this.props;
    const { form, dialog } = this.state;

    return (
      <React.Fragment>
        <Grid
          container
          justify="space-between"
          alignItems="flex-end"
        >
          <Grid item>
            <Typography role="header" variant="title" className={classes.headline} data-qa-table={type}>
              {title}
            </Typography>
          </Grid>
          <Grid item>
            {type === 'Personal Access Token' &&
              <AddNewLink
                onClick={this.openCreateDrawer}
                label="Add a Personal Access Token"
              />
            }
          </Grid>
        </Grid>
        <Paper className={classes.paper}>
          <Table aria-label="List of Personal Access Tokens">
            <TableHead>
              <TableRow data-qa-table-head>
                <TableCell className={classes.labelCell}>Label</TableCell>
                <TableCell className={classes.typeCell}>Type</TableCell>
                <TableCell className={classes.createdCell}>Created</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              { this.renderContent() }
            </TableBody>
          </Table>
        </Paper>
        <PaginationFooter
          page={this.props.page}
          pageSize={this.props.pageSize}
          count={this.props.count}
          handlePageChange={this.props.handlePageChange}
          handleSizeChange={this.props.handlePageSizeChange}
        />

        <APITokenDrawer
          open={form.open}
          mode={form.mode}
          errors={form.errors}
          id={form.id}
          label={form.values.label}
          scopes={form.values.scopes}
          expiry={form.values.expiry}
          closeDrawer={this.closeDrawer}
          onChange={this.handleDrawerChange}
          onCreate={this.createToken}
          onEdit={this.editToken}
        />

        <ConfirmationDialog
          title={`Revoking ${dialog.label}`}
          open={dialog.open}
          error={(this.state.dialog.errors || []).map(e => e.reason).join(',')}
          actions={this.renderRevokeConfirmationActions}
          onClose={this.closeRevokeDialog}
        >
          <Typography>Are you sure you want to revoke this API Token?</Typography>
        </ConfirmationDialog>

        <ConfirmationDialog
          title="Personal Access Token"
          error={(this.state.dialog.errors || []).map(e => e.reason).join(',')}
          actions={this.renderPersonalAccessTokenDisplayActions}
          open={Boolean(this.state.token && this.state.token.open)}
          onClose={this.closeTokenDialog}
        >
          <Typography variant="body1">
            {`Your personal access token has been created.
              Store this secret. It won't be shown again.`}
          </Typography>
          <Notice typeProps={{ variant: 'caption' }} warning text={this.state.token && this.state.token.value!} />
        </ConfirmationDialog>
      </React.Fragment>
    );
  }
  revokeAction = () => {
    const { dialog: { type } } = this.state;

    type === 'OAuth Client Token'
      ? this.revokeAppToken()
      : this.revokePersonalAccessToken();
  }

  renderRevokeConfirmationActions = () => {
    return (
      <React.Fragment>
        <ActionsPanel>
          <Button
            type="cancel"
            onClick={this.closeRevokeDialog}
            data-qa-button-cancel
          >
            Cancel
          </Button>
          <Button
            type="secondary"
            destructive
            onClick={this.revokeAction}
            data-qa-button-confirm>
            Revoke
          </Button>
        </ActionsPanel>
      </React.Fragment>
    );
  }

  renderPersonalAccessTokenDisplayActions = () =>
    <Button
      type="secondary"
      onClick={this.closeTokenDialog}
      data-qa-close-dialog
    >
      OK
    </Button>
}

const formatDates = (aLongTimeFromNow: any) => (token: Linode.Token): Linode.Token => {
  const created = moment.utc(token.created).local();
  const expiry = moment.utc(token.expiry).local();

  return {
    ...token,
    created: created > aLongTimeFromNow ? 'never' : created.fromNow(),
    expiry: expiry > aLongTimeFromNow ? 'never' : expiry.fromNow(),
  };
}

const updateTokensResponse = (response: Linode.ResourcePage<Linode.Token>) => {
  const now = moment.utc().add(10, 's').format();
  const isPastNow = isPast(now);
  const aLongTimeFromNow = moment.utc().add(100, 'year');

  return {
    ...response,
    data: response
      .data
      .filter((token) => isPastNow(token.expiry))
      .map(formatDates(aLongTimeFromNow))
  }
}

const styled = withStyles(styles, { withTheme: true });

const updatedRequest = (ownProps: Props, params: any, filters: any) => {
  if (ownProps.type === 'OAuth Client Token') {
    return getAppTokens(params, filters)
      .then(updateTokensResponse);
  } else {
    return getPersonalAccessTokens(params, filters)
      .then(response => response)
      .then(updateTokensResponse)
  }
}

const paginated = Pagey(updatedRequest);

const enhanced = compose<any, any, any>(
  paginated,
  styled
);

export default enhanced(APITokenTable);

